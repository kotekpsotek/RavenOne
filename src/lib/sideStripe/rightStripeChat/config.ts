import { browser } from "$app/environment";
import { isCurrentUserSelectedFileEditor } from "$lib/stores/collaboration";
import { derived, get, writable } from "svelte/store";
import type { AIChatMode } from "@ravenlens/shared/chat-ai/frontend";

const DEFAULT_CHAT_WIDTH = 420;
const MIN_CHAT_WIDTH = 300;
const MAX_CHAT_WIDTH = 760;
const DEFAULT_CHAT_HEIGHT = 360;
const MIN_CHAT_HEIGHT = 240;
const MAX_CHAT_HEIGHT_VIEWPORT_RATIO = 0.8;

export const chatLayoutStore = (() => {
    const chatLayoutStore = writable({
        width: DEFAULT_CHAT_WIDTH,
        minWidth: MIN_CHAT_WIDTH,
        maxWidth: MAX_CHAT_WIDTH,
        height: DEFAULT_CHAT_HEIGHT,
        minHeight: MIN_CHAT_HEIGHT,
        maxHeightViewportRatio: MAX_CHAT_HEIGHT_VIEWPORT_RATIO,
        isOpen: true
    });
    
    return {
        ...chatLayoutStore,
        updateWidth(widthCandidate: number) {
            const currentLayout = get(chatLayoutStore);
            const nextWidth = Math.max(currentLayout.minWidth, Math.min(currentLayout.maxWidth, widthCandidate));

            chatLayoutStore.update((layout) => ({
                ...layout,
                width: nextWidth
            }));
        },
        updateHeight(heightCandidate: number) {
            const currentLayout = get(chatLayoutStore);
            const maxHeightByViewport = browser
                ? Math.floor(window.innerHeight * currentLayout.maxHeightViewportRatio)
                : currentLayout.height;

            const maxHeight = Math.max(currentLayout.minHeight, maxHeightByViewport);
            const nextHeight = Math.max(currentLayout.minHeight, Math.min(maxHeight, heightCandidate));

            chatLayoutStore.update((layout) => ({
                ...layout,
                height: nextHeight
            }));
        },
        setOpen(open: boolean) {
            chatLayoutStore.update((layout) => ({
                ...layout,
                isOpen: open
            }));
        }
    }
})();

export interface ChatModeValue { 
    modeName: string;
    modeDescription: string;
    isEnabled: boolean;
}

export const CHAT_MODES = derived(
    [isCurrentUserSelectedFileEditor],
    ([isCollaborator]) => {
        return {
            "regular-ask": {
                modeName: "Ask",
                modeDescription: "Talk with AI for whatever",
                isEnabled: true
            },
            "document-manipulation": {
                modeName: "Document Manipulation",
                modeDescription: "Create, update RavenOne Document/s according to your specification",
                isEnabled: isCollaborator
            },
            "tasks-creation": {
                modeName: "Create Document Tasks",
                modeDescription: "Create Questions for actually selected RavenOne Document",
                isEnabled: isCollaborator
            }
        } satisfies Record<AIChatMode, ChatModeValue>;
    }
);
