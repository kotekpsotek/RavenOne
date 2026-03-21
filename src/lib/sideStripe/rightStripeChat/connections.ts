import { PUBLIC_CHAT_SERVICE_URL } from "$env/static/public";
import { fetchAuthenticated } from "$lib/utils/fetch";
import type { BackendChatPopulated } from "@ravenlens/shared/chat-ai/backend/schema";

export async function loadChatsFromFileRequest(
    fileId: string,
    workspaceId: string
): Promise<BackendChatPopulated[]> {
    try {
        const url = `${PUBLIC_CHAT_SERVICE_URL}/download_chats`
        const result = await fetchAuthenticated(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                fileId: fileId,
                workspaceId: workspaceId
            })
        });

        if (result.ok) {
            const chats = await result.json() as BackendChatPopulated[];
            return chats;
        }
        else return [];
    }
    catch {
        return [];
    }
}
