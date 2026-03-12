import { browser } from "$app/environment";
import { fetchAuthenticated } from "$lib/utils/fetch";
import { setAlert } from "$lib/utils/alert";
import type { AI } from "@ravenlens/shared";
import { get, writable } from "svelte/store";
import { File } from "@ravenlens/shared";
import { selectedWorkspace } from "./workspace";
import { collaborationInterface, entriesCollaborators, onHandleJoinFile, onHandleLeaveFile, setSelectedFileIdInCollaboration } from "./collaboration";
import { isSharedRoute } from "./share";
import { saveFileToDB, getAllFilesFromDB, clearAllFilesFromDB } from "$lib/utils/indexeddb";

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
export type SavingValues = boolean | "without-scardfolding";
export const isFileSaving = writable<SavingValues>(false);
export const isFileDownloading = writable<boolean>(false);

class PageHidePreserveFile {
    file: File.File.File;
    
    constructor(file: File.File.File) {
        this.file = file;
    }

    async loadToMemory() {
        await saveFileToDB(this.file);
    }

    /** TODO:  */
    static async undigAllFromMemoryAndSave() {
        const files = await getAllFilesFromDB();
        if (files.length === 0) return;

        for (const file of files) {
            await selectedFile.requestSave(file, "without-scardfolding", {
                showFailureAlert: false,
                requireChangedContent: false // Always save recovered files
            });
        }

        await clearAllFilesFromDB();
    }
}

// File
export const selectedFile = (() => {
    type FileType = File.File.File | undefined;
    type SaveSingleFileOptions = {
        keepalive?: boolean;
        showFailureAlert?: boolean;
        requireChangedContent?: boolean;
    };

    const store = writable<FileType>(undefined);
    const AUTOSAVE_INTERVAL_MS = 30000;
    const EMPTY_FILE_CONTENT = "<p></p>";
    let activeSaveRequests = 0;
    const persistedFileSignatures = new Map<string, string>();

    type SelectedFileStore = {
        subscribe: typeof store.subscribe;
        set(file: FileType): void;
        update(updater: (file: FileType) => FileType): void;
        selectFile(file: FileType): void;
        updateFileListItems(spawnedListId: string, items: File.File.EditableListItem[]): Promise<boolean>;
        requestSave(file: NonNullable<FileType>, saveValue?: SavingValues, options?: SaveSingleFileOptions): Promise<boolean>;
    };

    const normalizeWorkspaceId = (workspaceId?: string): string | undefined => {
        if (!workspaceId) {
            return undefined
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

    const normalizeContentForSignature = (contentCandidate: unknown): string => {
        if (typeof contentCandidate !== "string") {
            return EMPTY_FILE_CONTENT;
        }

        if (!contentCandidate.trim()) {
            return EMPTY_FILE_CONTENT;
        }

        return contentCandidate;
    }

    const getPersistedFileSignature = (file: NonNullable<FileType>): string => {
        return JSON.stringify({
            id: file.id,
            content: normalizeContentForSignature(file.content),
            lists: Array.isArray(file.lists) ? file.lists : []
        });
    }

    const rememberInitialPersistedSignature = (file: NonNullable<FileType>): void => {
        if (persistedFileSignatures.has(file.id)) {
            return;
        }

        persistedFileSignatures.set(file.id, getPersistedFileSignature(file));
    }

    const hasFileChangedSincePersisted = (file: NonNullable<FileType>): boolean => {
        const candidateSignature = getPersistedFileSignature(file);
        const persistedSignature = persistedFileSignatures.get(file.id);

        if (!persistedSignature) {
            persistedFileSignatures.set(file.id, candidateSignature);
            return false;
        }

        return candidateSignature !== persistedSignature;
    }

    const canCurrentUserSaveFile = (file: NonNullable<FileType>): boolean => {
        return entriesCollaborators.isCurrentUserEditor(file.id);
    }

    const syncEntryListWithFile = (file: File.File.File) => {
        entriesList.update(entries => updateEntryById(entries, file.id, file));
    }

    const clearCollaboratorsForFile = (fileId: string): void => {
        entriesCollaborators.update((entriesCollabs) => {
            return entriesCollabs.filter((collabOfEntry) => collabOfEntry.fileId !== fileId);
        });
    }

    const extractErrorMessage = async (response: Response): Promise<string> => {
        try {
            const body = await response.json() as { message?: unknown };
            if (typeof body?.message === "string" && body.message.trim().length) {
                return body.message;
            }
        } catch {
            // Keep fallback message when response body cannot be parsed.
            return "Cannot parse the response body";
        }

        return `Cannot save file because of: ${response.status}`;
    }

    const saveSingleFileRequest = async (
        fileToSave: NonNullable<FileType>,
        saveValue: SavingValues = true,
        options: SaveSingleFileOptions = {}
    ): Promise<boolean> => {
        if (options.requireChangedContent && !hasFileChangedSincePersisted(fileToSave)) {
            return false;
        }

        const workspaceId = getWorkspaceIdFromFile(fileToSave)
            ?? normalizeWorkspaceId(get(selectedWorkspace)?.id);

        if (!workspaceId) {
            if (options.showFailureAlert !== false) {
                setAlert("error", "Cannot save file", "Workspace id is missing for the selected file.");
            }

            return false;
        }

        if (!canCurrentUserSaveFile(fileToSave)) {
            return false;
        }

        activeSaveRequests += 1;
        isFileSaving.set(saveValue);

        try {
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
                        file: fileToSave
                    })
                }
            );

            if (!backendCall.ok) {
                const potentialType = (await backendCall.json());
                const errorMessage = await extractErrorMessage(backendCall);
                console.error(errorMessage);

                if (options.showFailureAlert !== false && (!potentialType.type || potentialType.type !== "collaboration_file")) {
                    setAlert("error", "Cannot save file", errorMessage);
                }

                return false;
            }

            persistedFileSignatures.set(fileToSave.id, getPersistedFileSignature(fileToSave));
            return true;
        } catch (error) {
            console.error("Cannot save file because of:", error);

            if (options.showFailureAlert !== false) {
                setAlert("error", "Cannot save file", "Network error occurred while saving file.");
            }

            return false;
        } finally {
            activeSaveRequests = Math.max(0, activeSaveRequests - 1);
            isFileSaving.set(activeSaveRequests > 0);
        }
    }

    const transitionSelection = async (
        selectedFileStore: Pick<SelectedFileStore, "set">,
        nextFile: FileType
    ): Promise<void> => {
        const fileBefore = get(store);
        const isShareRoute = get(isSharedRoute);

        if (fileBefore?.id === nextFile?.id) {
            selectedFileStore.set(nextFile);
            return;
        }

        if (fileBefore && !isShareRoute) {
            console.log("Leave")
            await saveSingleFileRequest(fileBefore, true, {
                requireChangedContent: true,
            });

            collaborationInterface
                .getInterface()
                ?.sendLeaveFile(toCollabFileRef(fileBefore), onHandleLeaveFile);
            clearCollaboratorsForFile(fileBefore.id);

        }

        if (nextFile && !isShareRoute) {
            console.log("Join")
            collaborationInterface
                .getInterface()
                ?.sendJoinFile(toCollabFileRef(nextFile), onHandleJoinFile);
        }

        selectedFileStore.set(nextFile);
    }
    
    if (browser) {
        window.setInterval(() => {
            const selectedFileLocal = get(store);
            if (!selectedFileLocal) {
                return;
            }

            void saveSingleFileRequest(selectedFileLocal, "without-scardfolding", {
                showFailureAlert: false,
                requireChangedContent: true,
            });
        }, AUTOSAVE_INTERVAL_MS);

        const PAGE_HIDE_DEDUP_MS = 1000;
        let lastPageHideSaveAt = 0;

        async function onPageHide() {
            const now = Date.now();
            if (now - lastPageHideSaveAt < PAGE_HIDE_DEDUP_MS) {
                return;
            }

            const selectedFileLocal = get(store);
            if (!selectedFileLocal) {
                return;
            }

            lastPageHideSaveAt = now;
            await new PageHidePreserveFile(selectedFileLocal).loadToMemory();
        }
        
        window.addEventListener("pagehide", onPageHide);
        window.addEventListener("beforeunload", onPageHide);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") {
                void onPageHide();
            }
        });

        // Initialize sync on startup
        queueMicrotask(() => {
            void PageHidePreserveFile.undigAllFromMemoryAndSave();
        });
    }

    const selectedFileStore: SelectedFileStore = {
        subscribe: store.subscribe,
        set(file: FileType) {
            const selectedFileBefore = get(store);
            store.set(file);

            if (file) {
                // Keep explorer tree in sync with selected file changes (also nested entries).
                syncEntryListWithFile(file);

                if (selectedFileBefore?.id !== file.id) {
                    rememberInitialPersistedSignature(file);
                }
            }
        },
        /** Selection of file with addition as joined file */
        selectFile(file: FileType) {
            void transitionSelection(this, file);
        },
        update(updater: (file: FileType) => FileType) {
            const nextFile = updater(get(store));
            this.set(nextFile);
        },
        updateFileListItems(spawnedListId: string, items: File.File.EditableListItem[]): Promise<boolean> {
            let wasUpdated = false;

            this.update(file => {
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

            return Promise.resolve(wasUpdated);
        },
        requestSave(file: NonNullable<FileType>, saveValue: SavingValues = true, options: SaveSingleFileOptions = {}): Promise<boolean> {
            return saveSingleFileRequest(file, saveValue, options);
        },
    };

    return selectedFileStore;
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
    patch: Partial<File.File.File>
) {
    entriesList.update(entries => updateEntryById(entries, fileId, patch));
    selectedFile.update(
        file => {
            if (!file || file.id !== fileId) {
                return file;
            }

            return { ...file, ...patch };
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
