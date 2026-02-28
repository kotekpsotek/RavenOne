import type { Range } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Instance } from "tippy.js";
import { get, writable } from "svelte/store";
import type { ElementInsertionItem } from "./ElementsListForMenus.js";

export const displayingItems = writable<ElementInsertionItem[]>([]);
export const activedIdx = writable<number>(0);
export const popup = writable<Instance[] | null>(null);

const suggestionContext = writable<{ editor: Editor; range: Range } | null>(null);

function closeSuggestionPopup() {
    popup.update((currentPopup) => {
        if (!currentPopup || !currentPopup[0]) {
            return currentPopup;
        }

        currentPopup[0].hide();
        return currentPopup;
    });
}

function executeSelection(item: ElementInsertionItem) {
    const context = get(suggestionContext);

    if (!context) {
        return;
    }

    item.command(context.editor, context.range);

    closeSuggestionPopup();
}

export function setSuggestionState(
    items: ElementInsertionItem[],
    editor: Editor,
    range: Range,
    resetActiveIndex = false
) {
    displayingItems.set(items);

    if (!items.length) {
        activedIdx.set(0);
    } else if (resetActiveIndex) {
        activedIdx.set(0);
    } else {
        const currentIndex = get(activedIdx);
        const nextIndex = Math.min(Math.max(currentIndex, 0), items.length - 1);
        activedIdx.set(nextIndex);
    }

    suggestionContext.set({ editor, range });
}

export function clearSuggestionState() {
    displayingItems.set([]);
    activedIdx.set(0);
    suggestionContext.set(null);
}

export function onItemSelected(item: ElementInsertionItem) {
    return () => {
        executeSelection(item);
    };
}

export function onKeyDown(event: KeyboardEvent): boolean {
    const items = get(displayingItems);
    if (!items.length) {
        return false;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        activedIdx.update((curr) => (curr + items.length - 1) % items.length);
        return true;
    }

    if (event.key === "ArrowDown") {
        event.preventDefault();
        activedIdx.update((curr) => (curr + 1) % items.length);
        return true;
    }

    if (event.key === "Enter") {
        event.preventDefault();
        const selectedIndex = get(activedIdx);
        const selectedItem = items[selectedIndex];
        if (selectedItem) {
            executeSelection(selectedItem);
            return true;
        }
    }

    return false;
}