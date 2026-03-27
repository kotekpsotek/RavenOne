import { browser } from "$app/environment";
import { isCurrentUserSelectedFileEditor } from "$lib/stores/collaboration";
import { derived, get, writable } from "svelte/store";
import type { AIChatMode } from "@ravenlens/shared/chat-ai/frontend";

const CHAT_LAYOUT_STORAGE_KEY = "ravenone:right-stripe-chat-layout";
const DEFAULT_CHAT_WIDTH = 420;
const MIN_CHAT_WIDTH = 300;
const MAX_CHAT_WIDTH = 760;
const DEFAULT_CHAT_HEIGHT = 360;
const MIN_CHAT_HEIGHT = 240;
const MAX_CHAT_HEIGHT_VIEWPORT_RATIO = 0.8;

interface ChatLayoutState {
    width: number;
    minWidth: number;
    maxWidth: number;
    height: number;
    minHeight: number;
    maxHeightViewportRatio: number;
    isOpen: boolean;
}

interface PersistedChatLayout {
    width?: number;
    height?: number;
}

function clamp(value: number, minValue: number, maxValue: number): number {
    return Math.max(minValue, Math.min(maxValue, value));
}

function getDefaultChatLayout(): ChatLayoutState {
    return {
        width: DEFAULT_CHAT_WIDTH,
        minWidth: MIN_CHAT_WIDTH,
        maxWidth: MAX_CHAT_WIDTH,
        height: DEFAULT_CHAT_HEIGHT,
        minHeight: MIN_CHAT_HEIGHT,
        maxHeightViewportRatio: MAX_CHAT_HEIGHT_VIEWPORT_RATIO,
        isOpen: true
    };
}

function getMaxHeightByViewport(maxHeightViewportRatio: number): number {
    return browser
        ? Math.floor(window.innerHeight * maxHeightViewportRatio)
        : DEFAULT_CHAT_HEIGHT;
}

function getInitialChatLayout(): ChatLayoutState {
    const defaultLayout = getDefaultChatLayout();

    if (!browser) {
        return defaultLayout;
    }

    const storedLayout = localStorage.getItem(CHAT_LAYOUT_STORAGE_KEY);

    if (!storedLayout) {
        return defaultLayout;
    }

    try {
        const parsedLayout = JSON.parse(storedLayout) as PersistedChatLayout;
        const maxHeight = Math.max(defaultLayout.minHeight, getMaxHeightByViewport(defaultLayout.maxHeightViewportRatio));

        return {
            ...defaultLayout,
            width: typeof parsedLayout.width === "number"
                ? clamp(parsedLayout.width, defaultLayout.minWidth, defaultLayout.maxWidth)
                : defaultLayout.width,
            height: typeof parsedLayout.height === "number"
                ? clamp(parsedLayout.height, defaultLayout.minHeight, maxHeight)
                : defaultLayout.height
        };
    }
    catch {
        return defaultLayout;
    }
}

export const chatLayoutStore = (() => {
    const chatLayoutStore = writable<ChatLayoutState>(getInitialChatLayout());

    if (browser) {
        chatLayoutStore.subscribe((layout) => {
            localStorage.setItem(CHAT_LAYOUT_STORAGE_KEY, JSON.stringify({
                width: layout.width,
                height: layout.height
            } satisfies PersistedChatLayout));
        });
    }
    
    return {
        ...chatLayoutStore,
        updateWidth(widthCandidate: number) {
            const currentLayout = get(chatLayoutStore);
            const nextWidth = clamp(widthCandidate, currentLayout.minWidth, currentLayout.maxWidth);

            chatLayoutStore.update((layout) => ({
                ...layout,
                width: nextWidth
            }));
        },
        updateHeight(heightCandidate: number) {
            const currentLayout = get(chatLayoutStore);
            const maxHeightByViewport = getMaxHeightByViewport(currentLayout.maxHeightViewportRatio);

            const maxHeight = Math.max(currentLayout.minHeight, maxHeightByViewport);
            const nextHeight = clamp(heightCandidate, currentLayout.minHeight, maxHeight);

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
            "tasks-manipulation": {
                modeName: "Create Document Tasks",
                modeDescription: "Create Questions for actually selected RavenOne Document",
                isEnabled: isCollaborator
            }
        } satisfies Record<AIChatMode, ChatModeValue>;
    }
);
