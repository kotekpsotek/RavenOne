import type { AIAnswer, ContextSpecificationPayload, PlayMode } from "$lib/editorComponents/types/AIList";
import type { AI } from "@ravenlens/shared";
import { writable } from "svelte/store";

export type ListItemKind = 'ordered' | 'unordered' | 'task';

export type EditableListItem = {
    id: string;
    text: string;
    depth: number;
    checked?: boolean;
    /** Present only when answers were provided */
    answers?: AIAnswer[];
    /** Playmode for this specific point */
    playMode?: PlayMode;
    /** Context for this specific point */
    context?: ContextSpecificationPayload;
};

export interface SpawnedList {
    id: string;
    kind: ListItemKind;
    name: string;
    icon: string;
    items: EditableListItem[];
};

export interface File {
    type: "file";
    id: string;
    name: string;
    createdAt: Date;
    /** It's the list with point items */
    lists: SpawnedList[];
    /** It's the editor content */
    content: string;
    createdByAuthorId: string;
    icon?: string;
    /** Walper is the cover url */
    walper?: string;
    subentries?: File[];
}

// Entries
export const entriesList = writable<File[]>([]);

// File
export const selectedFile = (() => {
    const store = writable<File | undefined>(undefined);

    return {
        ...store,
        updateFileListItems(spawnedListId: string, items: EditableListItem[]): Promise<boolean> {
            return new Promise<boolean>(res => {
                store.update(file => {
                    if (!file) {
                        res(false);
                        return file;
                    }
                    
                    const listIndex = file.lists.findIndex(list => list.id === spawnedListId);
                    if (listIndex < 0) {
                        res(false)
                        return file;
                    }
                    
                    // Update list items
                    const list = file.lists[listIndex];
                    list.items = items;                    
                    res(true);

                    // Return updated
                    return file;
                })
            })
        },
    };
})();

export type BrowserToolsUnion = "Web search" | "Current Document" | "RavenLens Documents";
export const availableTools = ["Web search", "Current Document", "RavenLens Documents"] as BrowserToolsUnion[];

// File config
export const selectedModel = writable<AI.RavenLensAvaiableAIModel | undefined>(undefined);
export const playMode = writable<PlayMode>("run-all");

const STORAGE_KEY = "raven_selected_tools";
const initialTools = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) 
    ? JSON.parse(localStorage.getItem(STORAGE_KEY)!) 
    : [];

export const selectedTools = writable<BrowserToolsUnion[]>(initialTools);

if (typeof window !== 'undefined') {
    selectedTools.subscribe(tools => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
    });
}


export const isSearchModalOpen = writable(false);

function updateEntryById(items: File[], fileId: string, patch: Partial<File>): File[] {
    return items.map(item => {
        if (item.id === fileId) {
            return { ...item, ...patch };
        }

        if (item.subentries?.length) {
            return {
                ...item,
                subentries: updateEntryById(item.subentries, fileId, patch)
            };
        }

        return item;
    });
}

export function patchFileById(fileId: string, patch: Partial<File>) {
    entriesList.update(entries => updateEntryById(entries, fileId, patch));
    selectedFile.update(file => {
        if (!file || file.id !== fileId) {
            return file;
        }

        return { ...file, ...patch };
    });
}

/**
 * Move an entry from one location to another.
 * @param sourceId The id of the entry to move.
 * @param targetId The id of the entry to drop on/near. If null, move to root.
 * @param position 'before' | 'after' | 'inside'
 */
export function moveEntry(sourceId: string, targetId: string | null, position: 'before' | 'after' | 'inside') {
    entriesList.update(entries => {
        if (sourceId === targetId) {
            return entries;
        }

        function findById(items: File[], id: string): File | null {
            for (const item of items) {
                if (item.id === id) {
                    return item;
                }

                if (item.subentries?.length) {
                    const nested = findById(item.subentries, id);
                    if (nested) {
                        return nested;
                    }
                }
            }

            return null;
        }

        function hasNestedEntry(item: File, searchId: string): boolean {
            if (!item.subentries?.length) {
                return false;
            }

            for (const subentry of item.subentries) {
                if (subentry.id === searchId || hasNestedEntry(subentry, searchId)) {
                    return true;
                }
            }

            return false;
        }

        if (targetId !== null) {
            const sourceEntry = findById(entries, sourceId);
            if (sourceEntry && hasNestedEntry(sourceEntry, targetId)) {
                return entries;
            }
        }

        let draggedItem: File | null = null;

        // 1. Find and remove the entry (immutable)
        function findAndRemove(items: File[]): File[] {
            const index = items.findIndex(i => i.id === sourceId);
            if (index !== -1) {
                draggedItem = items[index];
                return items.filter((_, i) => i !== index);
            }
            return items.map(item => {
                if (item.subentries?.length) {
                    return { ...item, subentries: findAndRemove(item.subentries) };
                }
                return item;
            });
        }

        // 2. Find target and insert (immutable)
        function findAndInsert(items: File[], itemToInsert: File): File[] {
            if (targetId === null) {
                return [...items, itemToInsert];
            }

            const index = items.findIndex(i => i.id === targetId);
            if (index !== -1) {
                const newItems = [...items];
                if (position === 'before') {
                    newItems.splice(index, 0, itemToInsert);
                } else if (position === 'after') {
                    newItems.splice(index + 1, 0, itemToInsert);
                } else if (position === 'inside') {
                    const target = items[index];
                    newItems[index] = {
                        ...target,
                        subentries: [...(target.subentries ?? []), itemToInsert]
                    };
                }
                return newItems;
            }

            return items.map(item => {
                if (item.subentries?.length) {
                    return { ...item, subentries: findAndInsert(item.subentries, itemToInsert) };
                }
                return item;
            });
        }

        const entriesWithoutSource = findAndRemove(entries);
        if (!draggedItem) return entries;

        return findAndInsert(entriesWithoutSource, draggedItem);
    });
}
