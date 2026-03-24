import type { AIChatMode, AIChatThread, ChatDropPosition, ChatStoreState, SelectedFileForChat } from "@ravenlens/backend";
import { normalizeText, normalizeWorkspaceId } from "./normalize";
import type { Profile } from "@ravenlens/shared";
import type { ProfileActiveCollborator } from "@ravenlens/shared/chat-ai/backend/schema";
import type { Collaborator } from "$lib/components/CollaboratorsBubble.types";

export function createId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}

	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getFileDescriptor(candidate: unknown): SelectedFileForChat | undefined {
    if (!candidate || typeof candidate !== "object") {
        return undefined;
    }

    const id = normalizeText((candidate as SelectedFileForChat).id).trim();
    const workspaceId = normalizeWorkspaceId((candidate as SelectedFileForChat).createdByAuthorId);
    if (!id || !workspaceId) {
        return undefined;
    }

    return {
        id,
        name: typeof (candidate as SelectedFileForChat).name === "string"
            ? (candidate as SelectedFileForChat).name
            : undefined,
        createdByAuthorId: workspaceId
    };
}

export function createInitialThread(title = "New chat", type: AIChatMode = "regular-ask"): AIChatThread {
    const now = new Date().toISOString();

    return {
        id: createId(),
        title,
        type,
        bubbles: [],
        createdAt: now,
        updatedAt: now
    };
}

export function createEmptyState(): ChatStoreState {
    return {
        chats: [],
        selectedChatId: undefined,
        isLoading: false,
        isSaving: false,
        loadError: undefined,
        fileId: undefined,
        workspaceId: undefined
    };
}

export function reorderChatsByPosition(
    chats: AIChatThread[],
    draggedChatId: string,
    targetChatId: string,
    position: ChatDropPosition
): AIChatThread[] {
    if (draggedChatId === targetChatId) {
        return chats;
    }

    const sourceIndex = chats.findIndex((chat) => chat.id === draggedChatId);
    const targetIndex = chats.findIndex((chat) => chat.id === targetChatId);

    if (sourceIndex < 0 || targetIndex < 0) {
        return chats;
    }

    const nextChats = [...chats];
    const [draggedChat] = nextChats.splice(sourceIndex, 1);
    if (!draggedChat) {
        return chats;
    }

    const adjustedTargetIndex = sourceIndex < targetIndex
        ? targetIndex - 1
        : targetIndex;
    const insertionIndex = position === "before"
        ? adjustedTargetIndex
        : adjustedTargetIndex + 1;

    nextChats.splice(insertionIndex, 0, draggedChat);
    return nextChats;
}

export function mapChatCollaboratorsToBubbleCollabs(collabsEntry: (Profile | ProfileActiveCollborator)[]): Collaborator[] {
    return collabsEntry.map(collab => ({
        id: collab.id,
        name: collab.name,
        profileImgURL: collab.profileImgURL,
        isEditor: (collab as ProfileActiveCollborator).isActive ?? false
    } satisfies Collaborator))
}
