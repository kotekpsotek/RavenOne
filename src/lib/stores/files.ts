import { browser } from "$app/environment";
import type { AIAnswer, ContextSpecificationPayload, PlayMode } from "$lib/editorComponents/types/AIList";
import { fetchAuthenticated } from "$lib/utils/fetch";
import type { AI } from "@ravenlens/shared";
import { get, writable } from "svelte/store";

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
/** Access saving state -> 'true' when file is actually saving, 'false' when is not */
export const isFileSaving = writable<boolean>(false);

// File
export const selectedFile = (() => {
    type FileType = File | undefined;
    type UnsavedFile = { file: NonNullable<File>; date: number };
    type SaveFilesOptions = { keepalive?: boolean };

    const store = writable<FileType>(undefined);
    const constructUnsavedFile = (file: File, dateTimestamp: number): UnsavedFile => {
        return {
            file: file,
            date: dateTimestamp
        }
    }

    const constructOldAndNewUnsavedFiles = (oldUnit?: FileType, newUnit?: FileType) => {
        return ([
            // Old file
            oldUnit ? 
                constructUnsavedFile(oldUnit, Date.now())
            :
                undefined,
            // New file is younger in date to be always threated as the newest version if multiple instances of same file occur in database
            newUnit ? 
                constructUnsavedFile(newUnit, Date.now() + 1)
            : 
                undefined
        ].filter(v => v !== undefined)) as UnsavedFile[]
    }

    const dedupeUnsavedFiles = (files: UnsavedFile[]): UnsavedFile[] => {
        const newestFiles = new Map<string, UnsavedFile>();

        for (const candidate of files) {
            const newestCandidate = newestFiles.get(candidate.file.id);

            if (!newestCandidate || newestCandidate.date < candidate.date) {
                newestFiles.set(candidate.file.id, candidate);
            }
        }

        return [...newestFiles.values()];
    }

    const unsavedFiles = (() => {
        // Waiting list
        const all = writable<UnsavedFile[]>([]);
        
        /**
         * Save file by send to backend and after success remove from 'Waiting List' or console.error when file cannot be saved
         * @param file - list with files will be send to save on backend
         * @returns - status of operation
        */
        async function saveFiles(files: UnsavedFile[], options: SaveFilesOptions = {}): Promise<boolean> {
            const filesToSave = dedupeUnsavedFiles(files);

            if (!filesToSave.length) {
                return true;
            }

            isFileSaving.set(true);

            try {
                const backendCall = await fetchAuthenticated(
                    `/api/files/save`,
                    {
                        method: "POST",
                        keepalive: options.keepalive,
                        body: JSON.stringify({
                            files: filesToSave
                        })
                    }
                );

                if (backendCall.status === 200) {
                    const savedFileIds = (await backendCall.json()) as string[]

                    // Remove saved files
                    all.update(waitListFiles => {
                        return waitListFiles.filter(waitListUnit => !savedFileIds.includes(waitListUnit.file.id));
                    })

                    return true;
                }

                console.error(`Cannot save files because of: ${backendCall.status}`);
            } catch (error) {
                console.error("Cannot save files because of:", error);
            }

            finally {
                // Reset saving state
                isFileSaving.set(false);
            }

            // Status
            return false;
        }

        async function flushPendingFiles(options: SaveFilesOptions = {}, currentFile?: FileType): Promise<boolean> {
            const filesToSave = dedupeUnsavedFiles([
                ...get(all),
                ...(currentFile ? [constructUnsavedFile(currentFile, Date.now())] : [])
            ]);

            return saveFiles(filesToSave, options);
        }

        return {
            ...all,
            // Add files to waiting list
            addNew(files: UnsavedFile[]) {
                if (!files.length) {
                    return;
                }

                all.update(storeFiles => [...storeFiles, ...files]);
            },
            // Manaually save the file
            saveFiles,
            flushPendingFiles,
        }
    })();
    
    if (browser) {
        window.addEventListener("pagehide", () => {
            void unsavedFiles.flushPendingFiles({ keepalive: true }, get(store));
        });

        // Interval loop to save all files and erase old
        setInterval(async () => {
            await unsavedFiles.flushPendingFiles();
        }, 30_000); // 30s
    }
    
    return {
        ...store,
        /** Use this function to construct file ready to be passed to 'saveFiles' function */
        constructUnsavedFile,
        /** Use this to save file manually */
        saveFiles: unsavedFiles.saveFiles,
        /** Set file */
        set(file: FileType) {
            // Setup old file and new to save
            /// Prepare store
            const priorFile = get(store);
            const filesToSave = constructOldAndNewUnsavedFiles(priorFile, file);

            /// Schedules files to be saved
            unsavedFiles.addNew(filesToSave);

            // Setup new file version 
            store.set(file);
        },
        update(updater: (file: FileType) => FileType) {
            const priorFile = get(store);
            
            store.update(updater);

            const afterFile = get(store);

            //
            const filesToSave = constructOldAndNewUnsavedFiles(priorFile, afterFile);

            /// Schedules files to be saved
            unsavedFiles.addNew(filesToSave);
        },
        updateFileListItems(spawnedListId: string, items: EditableListItem[]): Promise<boolean> {
            const priorFile = get(store);
            let wasUpdated = false;

            store.update(file => {
                if (!file) {
                    return file;
                }
                
                const listIndex = file.lists.findIndex(list => list.id === spawnedListId);
                if (listIndex < 0) {
                    return file;
                }

                wasUpdated = true;

                return {
                    ...file,
                    lists: file.lists.map((list, index) => {
                        if (index !== listIndex) {
                            return list;
                        }

                        return {
                            ...list,
                            items
                        };
                    })
                };
            });

            if (!wasUpdated) {
                return Promise.resolve(false);
            }

            const afterFile = get(store);
            unsavedFiles.addNew(constructOldAndNewUnsavedFiles(priorFile, afterFile));

            return Promise.resolve(true);
        },
    };
})();

export type BrowserToolsUnion = "Web search" | "Current Document" | "RavenOne Documents";
export const availableTools = ["Web search", "Current Document", "RavenOne Documents"] as BrowserToolsUnion[];

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
