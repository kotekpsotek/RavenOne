import type { File } from "$lib/stores/files";
import { playableDocumentsAndListsWithPoints } from "$lib/stores/playModeStore";
import { v4 as uuid } from "uuid";

export function createListId() {
    return `list-${uuid()}`;
}

export function createListItemId() {
    return `list-item-${uuid()}`;
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
