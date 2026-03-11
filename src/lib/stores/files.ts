import { browser } from "$app/environment";
import { fetchAuthenticated } from "$lib/utils/fetch";
import type { AI } from "@ravenlens/shared";
import { get, writable } from "svelte/store";
import { File } from "@ravenlens/shared";
import { selectedWorkspace } from "./workspace";
import { canManageWorkspaceFiles } from "./subscription";
import { collaborationInterface, entriesCollaborators, isCurrentUserSelectedFileEditor, isUserEditorForFile, onHandleJoinFile, onHandleLeaveFile, setSelectedFileIdInCollaboration } from "./collaboration";
import type { Collab } from "../../../../../packages/shared/dist/collaboration/collab";
import { userProfile } from "./user";

/** Entries */
export const entriesList = (() => {
    const entriesStore = writable<File.File.File[]>([]);

    if (browser) {
        const registerEntryListeners = (interfaceCollab: NonNullable<ReturnType<typeof collaborationInterface.getInterface>>) => {
            
        };

        // Delay access to collaborationInterface to avoid TDZ during circular module initialization.
        queueMicrotask(() => {
            const existingInterface = collaborationInterface.getInterface();
            if (existingInterface) {
                registerEntryListeners(existingInterface);
                return;
            }

            const unsubscribe = collaborationInterface.subscribe((interfaceCollab) => {
                if (!interfaceCollab) {
                    return;
                }

                registerEntryListeners(interfaceCollab);
                unsubscribe();
            });
        });
    }

    return entriesStore;
})();
/** Access saving state -> 'true' when file is actually saving, 'false' when is not */
export const isFileSaving = writable<boolean>(false);
export const isFileDownloading = writable<boolean>(false);

// File
export const selectedFile = (() => {
    type FileType = File.File.File | undefined;
    type UnsavedFile = { file: NonNullable<File.File.File>; date: number };
    type SaveFilesOptions = { keepalive?: boolean; workspaceId?: string };
    type UpdateOptions = {
        queueUnsaved?: boolean;
        emitFileChanged?: boolean;
        emitPresenceOnFileSwitch?: boolean;
    };

    const AUTO_SAVE_INTERVAL_MS = 30_000;

    const store = writable<FileType>(undefined);

    const normalizeWorkspaceId = (workspaceId?: string): string | undefined => {
        if (!workspaceId) {
            return undefined;
        }

        const normalizedWorkspaceId = workspaceId.trim();
        return normalizedWorkspaceId.length ? normalizedWorkspaceId : undefined;
    }

    const toCollabFileRef = (file: File.File.File): File.File.File => {
        return {
            id: file.id,
        } as File.File.File;
    }

    const getWorkspaceIdFromFile = (file?: FileType): string | undefined => {
        return normalizeWorkspaceId(file?.createdByAuthorId);
    }

    const getPersistedStateSignature = (file?: FileType): string => {
        if (!file) {
            return "";
        }

        return JSON.stringify({
            content: file.content ?? "",
            lists: file.lists ?? []
        });
    }

    const syncEntryListWithFile = (file: File.File.File) => {
        entriesList.update(entries => updateEntryById(entries, file.id, file));
    }

    const constructUnsavedFile = (file: File.File.File, dateTimestamp: number): UnsavedFile => {
        return {
            file: file,
            date: dateTimestamp
        }
    }

    const dedupeUnsavedFiles = (files: UnsavedFile[]): UnsavedFile[] => {
        const newestFiles = new Map<string, UnsavedFile>();

        for (const candidate of files) {
            const workspaceId = getWorkspaceIdFromFile(candidate.file) ?? "unknown";
            const dedupeKey = `${workspaceId}:${candidate.file.id}`;
            const newestCandidate = newestFiles.get(dedupeKey);

            if (!newestCandidate || newestCandidate.date < candidate.date) {
                newestFiles.set(dedupeKey, candidate);
            }
        }

        return [...newestFiles.values()];
    }

    const unsavedFiles = (() => {
        // Waiting list
        const all = writable<UnsavedFile[]>([]);

        const buildFilesToSave = (currentFile?: FileType): UnsavedFile[] => {
            return dedupeUnsavedFiles([
                ...get(all),
                ...(currentFile ? [constructUnsavedFile(currentFile, Date.now())] : [])
            ]);
        }
        
        /**
         * Save file by send to backend and after success remove from 'Waiting List' or console.error when file cannot be saved
         * @param file - list with files will be send to save on backend
         * @returns - status of operation
        */
        async function saveFiles(files: UnsavedFile[], options: SaveFilesOptions = {}): Promise<boolean> {
            const canManageWorkspaceFilesLocal = get(canManageWorkspaceFiles);
            if (!canManageWorkspaceFilesLocal) {
                return false;
            };
            
            const requestedWorkspaceId = normalizeWorkspaceId(options.workspaceId);
            const filesToSave = dedupeUnsavedFiles(files);
            const filesGroupedByWorkspace = new Map<string, UnsavedFile[]>();

            const userProfileLocal = get(userProfile);
            if (!userProfileLocal) {
                return false;
            }

            for (const candidate of filesToSave) {
                // Ignores file when user isn't file editor
                if (!isUserEditorForFile(get(entriesCollaborators), candidate.file.id, userProfileLocal.id)) {
                    continue;
                }
                
                const workspaceId = getWorkspaceIdFromFile(candidate.file) ?? requestedWorkspaceId;
                if (!workspaceId) {
                    continue;
                }

                if (requestedWorkspaceId && requestedWorkspaceId !== workspaceId) {
                    continue;
                }

                const normalizedCandidate = getWorkspaceIdFromFile(candidate.file)
                    ? candidate
                    : {
                        ...candidate,
                        file: {
                            ...candidate.file,
                            createdByAuthorId: workspaceId
                        }
                    };

                const groupedFiles = filesGroupedByWorkspace.get(workspaceId) ?? [];
                groupedFiles.push(normalizedCandidate);
                filesGroupedByWorkspace.set(workspaceId, groupedFiles);
            }

            if (!filesGroupedByWorkspace.size) {
                return true;
            }

            isFileSaving.set(true);
            let isSuccess = true;

            try {
                for (const [workspaceId, workspaceFiles] of filesGroupedByWorkspace.entries()) {
                    const backendCall = await fetchAuthenticated(
                        `/files/api/save_content`,
                        {
                            method: "POST",
                            keepalive: options.keepalive,
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                workspaceId,
                                files: workspaceFiles
                            })
                        }
                    );

                    if (backendCall.status !== 200) {
                        isSuccess = false;
                        console.error(`Cannot save files because of: ${backendCall.status}`);
                        continue;
                    }

                    const savedFileIds = (await backendCall.json()) as string[];
                    const savedFileIdsSet = new Set(savedFileIds);

                    // Remove saved files only from matching workspace.
                    all.update(waitListFiles => {
                        return waitListFiles.filter(waitListUnit => {
                            const waitListWorkspaceId = getWorkspaceIdFromFile(waitListUnit.file);
                            if (waitListWorkspaceId !== workspaceId) {
                                return true;
                            }

                            return !savedFileIdsSet.has(waitListUnit.file.id);
                        });
                    });
                }
            } catch (error) {
                isSuccess = false;
                console.error("Cannot save files because of:", error);
            }

            finally {
                // Reset saving state
                isFileSaving.set(false);
            }

            // Status
            return isSuccess;
        }

        async function flushPendingFiles(options: SaveFilesOptions = {}, currentFile?: FileType): Promise<boolean> {
            return saveFiles(buildFilesToSave(currentFile), options);
        }

        function flushPendingFilesOnExit(currentFile?: FileType): void {
            if (!get(all).length && !currentFile) {
                return;
            }

            void flushPendingFiles({ keepalive: true }, currentFile);
        }

        function clear(workspaceId?: string) {
            const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);

            if (!normalizedWorkspaceId) {
                all.set([]);
                return;
            }

            all.update(waitListFiles => {
                return waitListFiles.filter(waitListUnit => getWorkspaceIdFromFile(waitListUnit.file) !== normalizedWorkspaceId);
            });
        }

        function hasPending(workspaceId?: string): boolean {
            const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
            const pendingFiles = get(all);

            if (!normalizedWorkspaceId) {
                return pendingFiles.length > 0;
            }

            return pendingFiles.some(waitListUnit => getWorkspaceIdFromFile(waitListUnit.file) === normalizedWorkspaceId);
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
            flushPendingFilesOnExit,
            clear,
            hasPending,
        }
    })();
    
    if (browser) {
        const flushPendingOnPageLeave = () => {
            if (!unsavedFiles.hasPending()) {
                return;
            }

            unsavedFiles.flushPendingFilesOnExit(get(store));
        };

        function onPageHide() {
            //
            const collaborationInterfaceLocal = collaborationInterface.getInterface();

            // Save the queued file
            flushPendingOnPageLeave();

            // Leave file -> if was selected
            const selectedFileLocal = get(selectedFile);
            if (selectedFileLocal) {
                collaborationInterfaceLocal?.sendLeaveFile(toCollabFileRef(selectedFileLocal), onHandleLeaveFile);
            }
        }
        
        window.addEventListener("pagehide", onPageHide);
        window.addEventListener("beforeunload", onPageHide);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") {
                onPageHide();
            }
        });

        let activeWorkspaceId = normalizeWorkspaceId(get(selectedWorkspace)?.id);

        selectedWorkspace.subscribe(workspace => {
            const nextWorkspaceId = normalizeWorkspaceId(workspace?.id);

            if (activeWorkspaceId && activeWorkspaceId !== nextWorkspaceId) {
                const currentFile = get(store);
                const currentFileFromPreviousWorkspace = currentFile && getWorkspaceIdFromFile(currentFile) === activeWorkspaceId
                    ? currentFile
                    : undefined;

                // Clears unsaved files
                void unsavedFiles
                    .flushPendingFiles({ keepalive: true, workspaceId: activeWorkspaceId }, currentFileFromPreviousWorkspace)
                    .finally(() => {
                        unsavedFiles.clear(activeWorkspaceId);
                    });
            }

            // New workspace should always start with an empty waiting list.
            if (nextWorkspaceId && activeWorkspaceId !== nextWorkspaceId) {
                unsavedFiles.clear(nextWorkspaceId);
            }

            activeWorkspaceId = nextWorkspaceId;
        });

        // Interval loop to save all files and erase old
        setInterval(async () => {
            if (!unsavedFiles.hasPending()) {
                return;
            }

            await unsavedFiles.flushPendingFiles();
        }, AUTO_SAVE_INTERVAL_MS);
    }
    
    return {
        ...store,
        /** Use this function to construct file ready to be passed to 'saveFiles' function */
        constructUnsavedFile,
        /** Use this to save file manually */
        saveFiles: unsavedFiles.saveFiles,
        /** Flush files waiting in queue */
        flushPendingFiles: unsavedFiles.flushPendingFiles,
        /** Set file */
        set(file: FileType) {
            const priorFile = get(store);
            const didSwitchFile = priorFile?.id !== file?.id;
            const shouldFlushPreviousFile = Boolean(priorFile && didSwitchFile);

            if (shouldFlushPreviousFile && priorFile) {
                // Ensure old file is included and flushed before focus moves away.
                unsavedFiles.addNew([constructUnsavedFile(priorFile, Date.now())]);
                void unsavedFiles.flushPendingFiles(
                    { workspaceId: getWorkspaceIdFromFile(priorFile) },
                    priorFile
                );
            }

            // Setup new file version
            store.set(file);
        },
        /** Selection of file with addition as joined file */
        selectFile(file: FileType) {
            const collab = collaborationInterface.getInterface();
            
            // User leaves the prior file
            const fileBefore = get(store);
            if (fileBefore && fileBefore.id !== file?.id) {
                collab?.sendLeaveFile(toCollabFileRef(fileBefore), onHandleLeaveFile);

                // Clears collaborators of leaved file
                entriesCollaborators.update(entriesCollabs => {
                    return entriesCollabs.map(collabOfEntry => {
                        if (collabOfEntry.fileId === fileBefore.id) {
                            return undefined;
                        } 

                        return collabOfEntry;
                    }).filter(entry => entry !== undefined);
                });
            }

            // User join new file
            if (file && file.id !== fileBefore?.id) {
                collab?.sendJoinFile(toCollabFileRef(file), onHandleJoinFile);
            }

            // Setup the file
            store.set(file);
        },
        update(updater: (file: FileType) => FileType, options: UpdateOptions = {}) {
            const priorFile = get(store);
            const priorPersistedState = getPersistedStateSignature(priorFile);
            const collab = collaborationInterface.getInterface();
            
            // Updater
            store.update(updater);

            const afterFile = get(store);
            const didSwitchFile = priorFile?.id !== afterFile?.id;

            if (didSwitchFile && options.emitPresenceOnFileSwitch !== false) {
                if (priorFile) {
                    collab?.sendLeaveFile(toCollabFileRef(priorFile), onHandleLeaveFile);
                }

                if (afterFile) {
                    collab?.sendJoinFile(toCollabFileRef(afterFile), onHandleJoinFile);
                }
            }

            if (afterFile) {
                // Keep explorer tree in sync with selected file changes (also nested entries).
                syncEntryListWithFile(afterFile);
            }

            if (!afterFile || !priorFile || priorFile.id !== afterFile.id) {
                return;
            }

            const afterPersistedState = getPersistedStateSignature(afterFile);
            if (priorPersistedState === afterPersistedState) {
                return;
            }

            if (options.queueUnsaved !== false) {
                // Schedule only persisted changes (content/lists) for autosave.
                unsavedFiles.addNew([constructUnsavedFile(afterFile, Date.now())]);
            }
        },
        updateFileListItems(spawnedListId: string, items: File.File.EditableListItem[]): Promise<boolean> {
            const priorFile = get(store);
            const priorPersistedState = getPersistedStateSignature(priorFile);
            const collab = collaborationInterface.getInterface();
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
            if (afterFile) {
                syncEntryListWithFile(afterFile);
            }

            const afterPersistedState = getPersistedStateSignature(afterFile);

            if (afterFile && priorPersistedState !== afterPersistedState) {
                unsavedFiles.addNew([constructUnsavedFile(afterFile, Date.now())]);
            }

            return Promise.resolve(true);
        },
    };
})();

selectedFile.subscribe((file) => {
    setSelectedFileIdInCollaboration(file?.id);
});

export const availableTools = ["Web search", "Current Document", "RavenOne Documents"] as File.FileAI.BrowserToolsUnion[];

// File config
export const selectedModel = writable<AI.RavenLensAvaiableAIModel | undefined>(undefined);
export const playMode = writable<File.FileAI.PlayMode>("run-all");

const STORAGE_KEY = "raven_selected_tools";
const initialTools = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) 
    ? JSON.parse(localStorage.getItem(STORAGE_KEY)!) 
    : [];

export const selectedTools = writable<File.FileAI.BrowserToolsUnion[]>(initialTools);

if (typeof window !== 'undefined') {
    selectedTools.subscribe(tools => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
    });
}


export const isSearchModalOpen = writable(false);

function updateEntryById(items: File.File.File[], fileId: string, patch: Partial<File.File.File>): File.File.File[] {
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

export function patchFileById(
    fileId: string,
    patch: Partial<File.File.File>,
    options: {
        queueUnsaved?: boolean;
        emitFileChanged?: boolean;
    } = {}
) {
    entriesList.update(entries => updateEntryById(entries, fileId, patch));
    selectedFile.update(
        file => {
            if (!file || file.id !== fileId) {
                return file;
            }

            return { ...file, ...patch };
        },
        {
            queueUnsaved: options.queueUnsaved,
            emitFileChanged: options.emitFileChanged,
            emitPresenceOnFileSwitch: false
        }
    );
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

        function findById(items: File.File.File[], id: string): File.File.File | null {
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

        function hasNestedEntry(item: File.File.File | null, searchId: string): boolean {
            if (!item?.subentries?.length) {
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

        let draggedItem: File.File.File | null = null;

        // 1. Find and remove the entry (immutable)
        function findAndRemove(items: File.File.File[]): File.File.File[] {
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
        function findAndInsert(items: File.File.File[], itemToInsert: File.File.File): File.File.File[] {
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
