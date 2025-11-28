import { createContext } from "react";


/**
 * HTTP streaming context to replace WebSocket
 * Provides: send, registerMessageHandler, unregisterMessageHandler,
 *           streamingStatuses, setConversationStatus, clearConversationStatus
 * registerMessageHandler(conversationId?, handler, options?)
 */
export const HttpStreamContext = createContext({
    send: () => { },
    registerMessageHandler: () => { },
    unregisterMessageHandler: () => { },
    streamingStatuses: {},
    setConversationStatus: () => { },
    clearConversationStatus: () => { },
});
