import { useContext } from "react";

import { HttpStreamContext } from "./index";

export const useHttpStream = () => {
    const context = useContext(HttpStreamContext);
    if (context === undefined) {
        throw new Error("useHttpStream must be used within a HttpStreamProvider");
    }
    // ===== 提示：同时提供 streamingStatuses / setConversationStatus / clearConversationStatus =====
    return context;
};
