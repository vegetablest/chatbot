import { useReducer } from "react";
import PropTypes from "prop-types";

import { MessageContext } from "./index";
import { messagesReducer } from "./reducer";


export const MessageProvider = ({ children }) => {
    const [state, dispatch] = useReducer(
        messagesReducer,
        { activeId: null, conversations: {} }
    );

    const currentMessages = state.activeId ? state.conversations[state.activeId] ?? [] : [];
    const currentConv = {
        id: state.activeId,
        messages: currentMessages,
    };

    return (
        <MessageContext.Provider value={{ currentConv, conversations: state.conversations, dispatch }}>
            {children}
        </MessageContext.Provider>
    );
};

MessageProvider.propTypes = {
    children: PropTypes.node.isRequired,
};
