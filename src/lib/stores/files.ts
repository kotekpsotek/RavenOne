import { writable } from "svelte/store";

export interface File {
    type: "file";
    id: string;
    name: string;
    createdAt: Date;
    content: string;
    createdByAuthorId: string;
}

export interface Folder {
    type: "folder";
    id: string;
    name: string;
    createdAt: Date;
    subentries: (Folder | File)[]
    createdByAuthorId: string;
}

export const entriesList = writable<(File | Folder)[]>([]);

export const selectedFile = writable<File | undefined>(undefined);

/**
 * Move an entry from one location to another.
 * @param sourceId The id of the entry to move.
 * @param targetId The id of the entry to drop on/near. If null, move to root.
 * @param position 'before' | 'after' | 'inside'
 */
export function moveEntry(sourceId: string, targetId: string | null, position: 'before' | 'after' | 'inside') {
    entriesList.update(entries => {
        let draggedItem: File | Folder | null = null;

        // 1. Find and remove the entry (immutable)
        function findAndRemove(items: (File | Folder)[]): (File | Folder)[] {
            const index = items.findIndex(i => i.id === sourceId);
            if (index !== -1) {
                draggedItem = items[index];
                return items.filter((_, i) => i !== index);
            }
            return items.map(item => {
                if ('subentries' in item) {
                    return { ...item, subentries: findAndRemove(item.subentries) };
                }
                return item;
            });
        }

        // 2. Find target and insert (immutable)
        function findAndInsert(items: (File | Folder)[], itemToInsert: File | Folder): (File | Folder)[] {
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
                    if ('subentries' in target) {
                        newItems[index] = {
                            ...target,
                            subentries: [...target.subentries, itemToInsert]
                        };
                    }
                }
                return newItems;
            }

            return items.map(item => {
                if ('subentries' in item) {
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
