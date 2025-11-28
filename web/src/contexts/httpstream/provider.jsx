import { useCallback, useRef, useState } from "react";
import PropTypes from "prop-types";

import { HttpStreamContext } from "./index";


export const HttpStreamProvider = ({ children }) => {
    const messageHandlers = useRef(new Map());
    const [streamingStatuses, setStreamingStatuses] = useState({});

    const setConversationStatus = useCallback((conversationId, status) => {
        if (!conversationId) {
            return;
        }
        setStreamingStatuses((prev) => {
            if (prev[conversationId] === status) {
                return prev;
            }
            return { ...prev, [conversationId]: status };
        });
    }, []);

    const clearConversationStatus = useCallback((conversationId) => {
        if (!conversationId) {
            return;
        }
        setStreamingStatuses((prev) => {
            if (!(conversationId in prev)) {
                return prev;
            }
            const next = { ...prev };
            delete next[conversationId];
            return next;
        });
    }, []);

    const extractConversationId = useCallback((url) => {
        // ===== 提示：解析 URL 中的会话编号，保持数据流有序 =====
        const match = url.match(/\/conversations\/([^/]+)/);
        return match ? match[1] : null;
    }, []);

    const notifyHandlers = useCallback((conversationId, payload) => {
        messageHandlers.current.forEach(({ conversationId: registeredConversationId }, handler) => {
            if (registeredConversationId !== null && conversationId !== null && registeredConversationId !== conversationId) {
                return;
            }
            if (registeredConversationId !== null && conversationId === null) {
                return;
            }
            try {
                handler(payload);
            } catch (error) {
                console.error("Error in message handler", error);
            }
        });
    }, []);

    const send = useCallback(async (url, message) => {
        const conversationId = extractConversationId(url);
        if (conversationId) {
            setConversationStatus(conversationId, "running");
        }
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(message),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.trim().startsWith('data: ')) {
                        continue;
                    }
                    const data = line.trim().substring(6);
                    if (!data) {
                        continue;
                    }
                    notifyHandlers(conversationId, data);
                }
            }

            if (conversationId) {
                setConversationStatus(conversationId, "completed");
            }
        } catch (error) {
            console.error("Error in HTTP stream:", error);

            const errorMessage = JSON.stringify({
                type: "error",
                content: "Connection error occurred"
            });
            notifyHandlers(conversationId, errorMessage);
            if (conversationId) {
                setConversationStatus(conversationId, "failed");
            }
        }
    }, [extractConversationId, notifyHandlers, setConversationStatus]);

    const registerMessageHandler = useCallback((conversationIdOrHandler, maybeHandler, options = {}) => {
        const hasExplicitConversationId = typeof conversationIdOrHandler !== "function";
        const conversationId = hasExplicitConversationId ? conversationIdOrHandler ?? null : null;
        const handler = hasExplicitConversationId ? maybeHandler : conversationIdOrHandler;

        if (typeof handler !== "function") {
            throw new Error("registerMessageHandler requires a function handler");
        }

        const persistent = Boolean(options?.persistent);
        messageHandlers.current.set(handler, { conversationId, persistent });
        return handler;
    }, []);

    const unregisterMessageHandler = useCallback((handler) => {
        messageHandlers.current.delete(handler);
    }, []);

    return (
        <HttpStreamContext.Provider
            value={{
                send,
                registerMessageHandler,
                unregisterMessageHandler,
                streamingStatuses,
                setConversationStatus,
                clearConversationStatus,
            }}
        >
            {children}
        </HttpStreamContext.Provider>
    )
};

HttpStreamProvider.propTypes = {
    children: PropTypes.node.isRequired,
};
