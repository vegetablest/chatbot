from __future__ import annotations

import logging
from datetime import datetime, UTC
from typing import TYPE_CHECKING, Callable

from langchain_core.messages import BaseMessage, SystemMessage, trim_messages
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import END, START, MessagesState, StateGraph

from chatbot.safety import create_hazard_classifier, hazard_categories

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langgraph.checkpoint.base import BaseCheckpointSaver
    from langgraph.graph.graph import CompiledGraph


logger = logging.getLogger(__name__)


def create_agent(
    chat_model: BaseChatModel,
    *,
    safety_model: BaseChatModel | None = None,
    checkpointer: BaseCheckpointSaver = None,
    token_counter: (
        Callable[[list[BaseMessage]], int] | Callable[[BaseMessage], int] | None
    ) = None,
    max_tokens: int = 20,
) -> CompiledGraph:
    if token_counter is None:
        if hasattr(chat_model, "get_num_tokens_from_messages"):
            token_counter = chat_model.get_num_tokens_from_messages
        else:
            logger.warning(
                "Could not get token counter function from chat model, will truncate messages by message count. This may lead to context overflow."
            )
            token_counter = len
    if max_tokens is None:
        raise ValueError("`None` passed as `max_tokens` which is not allowed")

    # leave 0.2 for new tokens
    _max_tokens = int(max_tokens * 0.8)

    hazard_classifier = None
    if safety_model is not None:
        hazard_classifier = create_hazard_classifier(safety_model)

    async def input_guard(state: MessagesState) -> MessagesState:
        if hazard_classifier is not None:
            last_message = state["messages"][-1]
            flag, category = await hazard_classifier.ainvoke(
                input={"messages": [last_message]}
            )
            if flag == "unsafe" and category is not None:
                # patch the hazard category to the last message
                last_message.additional_kwargs = last_message.additional_kwargs | {
                    "hazard": category
                }
                return {"messages": [last_message]}
        return {"messages": []}

    async def run_output_guard(state: MessagesState) -> MessagesState:
        if hazard_classifier is not None:
            flag, category = await hazard_classifier.ainvoke(
                input={"messages": state["messages"][-2:]}
            )
            if flag == "unsafe" and category is not None:
                # TODO: implementation
                # Re-generate? or how can I update the last message?
                ...
        return {"messages": []}

    async def chatbot(state: MessagesState) -> MessagesState:
        """Process the current state and generate a response using the LLM."""

        instruction = """You are Rei, the ideal assistant dedicated to assisting users effectively. Always assist with care, respect, and truth. Respond with utmost utility yet securely. Avoid harmful, unethical, prejudiced, or negative content. Ensure replies promote fairness and positivity.
When solving problems, decompose them into smaller parts, think through each part step by step before providing your final answer. Enclose your thought process within HTML tags: <think> and </think>.
The content inside the <think> tags is for your internal use only and will not be visible to the user or me.

Current date: {date}
"""

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", instruction),
                ("placeholder", "{messages}"),
            ]
        )

        bound = prompt | chat_model

        hint_message = None
        if hazard := state["messages"][-1].additional_kwargs.get("hazard"):
            hint_message = SystemMessage(
                content=f"""The user input may contain inproper content related to:
{hazard_categories.get(hazard)}

Please respond with care and professionalism. Avoid engaging with harmful or unethical content. Instead, guide the user towards more constructive and respectful communication."""
            )

        all_messages = (
            state["messages"] + hint_message if hint_message else state["messages"]
        )
        windowed_messages: list[BaseMessage] = trim_messages(
            all_messages,
            token_counter=token_counter,
            max_tokens=_max_tokens,
            start_on="human",  # This means that the first message should be from the user after trimming.
        )

        last_message_at = windowed_messages[-1].additional_kwargs.get("sent_at")
        responding_at = (
            datetime.fromisoformat(last_message_at)
            if last_message_at
            else datetime.now(tz=UTC)
        )

        messages = await bound.ainvoke(
            {
                "messages": windowed_messages,
                "date": responding_at.strftime("%Y-%m-%d (%A)"),
            }
        )
        return {"messages": [messages]}

    builder = StateGraph(MessagesState)
    builder.add_node(input_guard)
    builder.add_node(chatbot)

    builder.add_edge(START, "input_guard")
    builder.add_edge("input_guard", "chatbot")
    builder.add_edge("chatbot", END)

    return builder.compile(checkpointer=checkpointer)
