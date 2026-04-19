import { playMode, selectedFile } from "$lib/stores/files";
import { playableDocumentsAndListsWithPoints } from "$lib/stores/playModeStore";
import type { File } from "$lib/sharedCompat";
import { get } from "svelte/store";
import { v4 as uuid } from "uuid";

export function createListId() {
    return `list-${uuid()}`;
}

export function createListItemId() {
    return `list-item-${uuid()}`;
}

export function findItemIndex(items: File.File.EditableListItem[], itemId: string) {
    return items.findIndex((item) => item.id === itemId);
}

export function findSubtreeEndIndex(items: File.File.EditableListItem[], startIndex: number) {
    const rootDepth = items[startIndex]?.depth ?? 0;
    let endIndex = startIndex + 1;

    while (endIndex < items.length && items[endIndex].depth > rootDepth) {
        endIndex += 1;
    }

    return endIndex;
}

/** Find items with depth about 1 bigger than others */
export function findItemDirectSubitems(items: File.File.EditableListItem[], item: File.File.EditableListItem) {
    const itemIndex = findItemIndex(items, item.id);
    if (itemIndex === -1) {
        console.warn(`Item doesn't exist so it hasn't got subitems`)
        return [];
    }

    const depth = item.depth;
    const foundSubItems: File.File.EditableListItem[] = [];
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

function hasNonEmptyTextContent(item: File.File.EditableListItem) {
    return item.text.trim().length > 0;
}

/** Returns all descendant points for the item at index (does not include the item itself). */
export function getAllSubpointChildrenByItemIndex(items: File.File.EditableListItem[], itemIndex: number) {
    if (itemIndex < 0 || itemIndex >= items.length) {
        return [];
    }

    const subtreeEndIndex = findSubtreeEndIndex(items, itemIndex);
    return items.slice(itemIndex + 1, subtreeEndIndex);
}

function getPointAndAllSubpointChildren(items: File.File.EditableListItem[], itemId: string) {
    const itemIndex = findItemIndex(items, itemId);
    if (itemIndex < 0) {
        return [];
    }

    return [
        items[itemIndex],
        ...getAllSubpointChildrenByItemIndex(items, itemIndex)
    ];
}

function isPointRunnableForMode(point: File.File.EditableListItem, selectedPlayMode: File.FileAI.PlayMode) {
    if (!hasNonEmptyTextContent(point)) {
        return false;
    }

    if (selectedPlayMode === "run-all") {
        return true;
    }

    return !point.answers?.length;
}

/**
 * Checks:
 * 1. Has file some list
 * 2. Has the list playable items
 * 3. Has some point with text
 * 4. Is not this point already playing
 */
export function isFilePlayable(file: File.File.File, selectedPlayMode: File.FileAI.PlayMode) {
    return file.lists?.some(list => {
        const itemCheck = list.items.some(item => {
            if (playableDocumentsAndListsWithPoints.isPointPlaying(file, list.id, item.id)) {
                return false;
            }

            const subtreePoints = getPointAndAllSubpointChildren(list.items, item.id);
            return subtreePoints.some(point => isPointRunnableForMode(point, selectedPlayMode));
        });
        
        return list.items.length > 0 && itemCheck;
    });
}

export function isPointPlayable(items: File.File.EditableListItem[], itemId: string, selectedPlayMode: File.FileAI.PlayMode = get(playMode)) {
    const subtreePoints = getPointAndAllSubpointChildren(items, itemId);
    if (!subtreePoints.length) {
        return false;
    }

    return subtreePoints.some(point => isPointRunnableForMode(point, selectedPlayMode));
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
