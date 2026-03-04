import { selectedFile, type EditableListItem, type File } from "$lib/stores/files";
import { playableDocumentsAndListsWithPoints } from "$lib/stores/playModeStore";
import { get } from "svelte/store";
import { v4 as uuid } from "uuid";

export function createListId() {
    return `list-${uuid()}`;
}

export function createListItemId() {
    return `list-item-${uuid()}`;
}

export function findItemIndex(items: EditableListItem[], itemId: string) {
    return items.findIndex((item) => item.id === itemId);
}

export function findSubtreeEndIndex(items: EditableListItem[], startIndex: number) {
    const rootDepth = items[startIndex]?.depth ?? 0;
    let endIndex = startIndex + 1;

    while (endIndex < items.length && items[endIndex].depth > rootDepth) {
        endIndex += 1;
    }

    return endIndex;
}

/** Find items with depth about 1 bigger than others */
export function findItemDirectSubitems(items: EditableListItem[], item: EditableListItem) {
    const itemIndex = findItemIndex(items, item.id);
    if (itemIndex === -1) {
        console.warn(`Item doesn't exist so it hasn't got subitems`)
        return [];
    }

    const depth = item.depth;
    const foundSubItems: EditableListItem[] = [];
    for (let index = itemIndex + 1; index < items.length; index += 1) {
        const currentItem = items[index];

        if (currentItem.depth <= depth) {
            break;
        }

        if (currentItem.depth === depth + 1) {
            foundSubItems.push(currentItem);
        }
    }

    return foundSubItems;
}

/**
 * Checks:
 * 1. Has file some list
 * 2. Has the list playable items
 * 3. Has some point with text
 * 4. Is not this point already playing
 */
export function isFilePlayable(file: File) {
    return file.lists?.some(list => {
        const itemCheck = list.items.some(item => item.text.trim().length > 0 && !playableDocumentsAndListsWithPoints.isPointPlaying(file, list.id, item.id));
        
        return list.items.length > 0 && itemCheck;
    });
}

function getNonEmptyChildItemsCount(items: EditableListItem[], itemId: string) {
    const itemIndex = findItemIndex(items, itemId);
    if (itemIndex === -1) {
        return 0;
    }

    const subtreeEndIndex = findSubtreeEndIndex(items, itemIndex);
    return items
        .slice(itemIndex + 1, subtreeEndIndex)
        .filter((item) => item.text.trim().length > 0).length;
}

export function isPointPlayable(items: EditableListItem[], itemId: string) {
    const itemIndex = findItemIndex(items, itemId);

    return getNonEmptyChildItemsCount(items, itemId) > 0 || items[itemIndex].text.trim().length > 0;
}

export function isPointSuccessorOfPoint(itemId: string, pointId: string, listId: string) {
    if (itemId === pointId) {
        return false;
    }

    const selectedFileLocal = get(selectedFile);
    if (!selectedFileLocal) {
        return false;
    }

    const list = selectedFileLocal.lists.find(list => list.id === listId);
    if (!list?.items.length) {
        return false;
    }

    const pointIndex = findItemIndex(list.items, pointId);
    const itemIndex = findItemIndex(list.items, itemId);
    if (pointIndex < 0 || itemIndex < 0 || itemIndex <= pointIndex) {
        return false;
    }

    const subtreeEndIndex = findSubtreeEndIndex(list.items, pointIndex);
    return itemIndex < subtreeEndIndex;
}
