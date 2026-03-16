import {
    asNonEmptyString,
    findFileById,
    loadWorkspaceEntries,
    parseJsonBody,
    persistWorkspaceEntries,
    requireWorkspaceAccess,
    updateFileById,
    type FileAiChatState
} from "../server-utils";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type LoadChatStateRequestBody = {
    workspaceId?: unknown;
    fileId?: unknown;
};

type SaveChatStateRequestBody = {
    workspaceId?: unknown;
    fileId?: unknown;
    chats?: unknown;
    selectedChatId?: unknown;
};

function normalizeChats(chatsCandidate: unknown): FileAiChatState["chats"] | null {
    if (!Array.isArray(chatsCandidate)) {
        return null;
    }

    return chatsCandidate as FileAiChatState["chats"];
}

function normalizeSelectedChatId(selectedChatIdCandidate: unknown): string | undefined {
    return asNonEmptyString(selectedChatIdCandidate);
}

function pickSelectedChatId(chats: FileAiChatState["chats"], selectedChatIdCandidate: string | undefined): string | undefined {
    if (!selectedChatIdCandidate) {
        return undefined;
    }

    const hasMatchingChat = chats.some((chatCandidate) => {
        if (!chatCandidate || typeof chatCandidate !== "object") {
            return false;
        }

        return asNonEmptyString((chatCandidate as { id?: unknown }).id) === selectedChatIdCandidate;
    });

    return hasMatchingChat ? selectedChatIdCandidate : undefined;
}

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<LoadChatStateRequestBody>(request);
    if (!requestBody) {
        return json({ ok: false, message: "Invalid request body" }, { status: 400 });
    }

    const workspaceId = asNonEmptyString(requestBody.workspaceId);
    const fileId = asNonEmptyString(requestBody.fileId);

    if (!workspaceId || !fileId) {
        return json({ ok: false, message: "workspaceId and fileId are required" }, { status: 400 });
    }

    const access = await requireWorkspaceAccess({
        request,
        cookies,
        fetchFn: fetch,
        workspaceId
    });

    if (access instanceof Response) {
        return access;
    }

    const workspaceEntries = await loadWorkspaceEntries(workspaceId);
    const fileEntry = findFileById(workspaceEntries, fileId);

    if (!fileEntry) {
        return json({ ok: false, message: "File was not found" }, { status: 404 });
    }

    return json(
        {
            ok: true,
            fileId,
            chats: fileEntry.aiChatState?.chats ?? [],
            selectedChatId: fileEntry.aiChatState?.selectedChatId ?? null
        },
        { status: 200 }
    );
};

export const PUT: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<SaveChatStateRequestBody>(request);
    if (!requestBody) {
        return json({ ok: false, message: "Invalid request body" }, { status: 400 });
    }

    const workspaceId = asNonEmptyString(requestBody.workspaceId);
    const fileId = asNonEmptyString(requestBody.fileId);
    const chats = normalizeChats(requestBody.chats);

    if (!workspaceId || !fileId || !chats) {
        return json({ ok: false, message: "workspaceId, fileId and chats are required" }, { status: 400 });
    }

    const access = await requireWorkspaceAccess({
        request,
        cookies,
        fetchFn: fetch,
        workspaceId,
        requireActiveWorkspaceSubscription: true,
        activeWorkspaceSubscriptionFailureMessage: "Cannot update chat state because this workspace has no active subscription"
    });

    if (access instanceof Response) {
        return access;
    }

    const selectedChatIdCandidate = normalizeSelectedChatId(requestBody.selectedChatId);
    const selectedChatId = pickSelectedChatId(chats, selectedChatIdCandidate);

    const workspaceEntries = await loadWorkspaceEntries(workspaceId);
    const updateResult = updateFileById(workspaceEntries, fileId, (entry) => {
        return {
            ...entry,
            aiChatState: {
                chats,
                ...(selectedChatId ? { selectedChatId } : {})
            }
        };
    });

    if (!updateResult.updated) {
        return json({ ok: false, message: "File was not found" }, { status: 404 });
    }

    await persistWorkspaceEntries(workspaceId, updateResult.entries);

    return json(
        {
            ok: true,
            updated: true,
            selectedChatId: selectedChatId ?? null,
            file: findFileById(updateResult.entries, fileId)
        },
        { status: 200 }
    );
};
