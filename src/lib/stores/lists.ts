import { stopExecutionResultsResize } from "$lib/list&tray/resize";
import { selectedFile } from "$lib/stores/files";
import { derived, get, writable } from "svelte/store";
import { File } from "@ravenlens/shared";

export type TabsAvailable = "Tasks" | "Routines" | "Spikes";

export const tabsAvailable: TabsAvailable[] = [
    "Tasks",
    "Routines",
    "Spikes"
];

/** For `Routines` and `Spikes` */
export const showExecutionResults = writable<boolean>(false);

/** List with selected point timestamps */
export const selectedSpikeRoutineResultDateTimestamps = writable<string[]>([]);
export const selectedSpikeRoutineId = writable<string | null>(null);

/** Is a selected document for routine or spike */
export const selectedSpikeRoutineDocument = (() => {
    const selectedDocument = writable<File.RoutinesSpikes.FrontendDownloadResultObject["resultDocumentsHTML"][number] | undefined>(undefined);

    return {
        ...selectedDocument,
        onSelectDocument(document: File.RoutinesSpikes.FrontendDownloadResultObject["resultDocumentsHTML"][number]) {
            return () => {
                const currentDocument = get(selectedDocument);

                if (currentDocument?.id === document.id) {
                    selectedDocument.set(undefined);
                }
                else selectedDocument.set(document);
            }
        },
        unselect() {
            selectedDocument.set(undefined);
        }
    }
})();

export const selectedTab = (() => {
    const { ...all } = writable<TabsAvailable>("Tasks");

    return {
        ...all,
        onSelectTab(tab: TabsAvailable) {
            return (_ev: Event) => {
                if (tab === "Tasks") {
                    showExecutionResults.set(false);
                    stopExecutionResultsResize();
                }

                // Clears selected document
                selectedSpikeRoutineDocument.set(undefined);
                
                //
                all.set(tab);
            }
        }
    }
})();

type TabConfigTarget = keyof Pick<File.File.File, "lists" | "routines" | "spikes">;
type TabContext = File.FileAI.ContextSpecificationPayload;
type TabModel = File.FileAI.UsedAIModel;

const EMPTY_CONTEXT: TabContext = {
    desktopFiles: [],
    editorFiles: [],
    networkUrls: []
};

const EMPTY_MODEL: TabModel = {
    id: "",
    name: "",
    provider: {
        provider: ""
    },
    weight: 0
};

export function getConfigTargetByTab(tab: TabsAvailable): TabConfigTarget {
    if (tab === "Routines") {
        return "routines";
    }

    if (tab === "Spikes") {
        return "spikes";
    }

    return "lists";
}

function cloneContext(context?: TabContext): TabContext {
    const contextLocal = context ?? EMPTY_CONTEXT;

    return {
        desktopFiles: [...(contextLocal.desktopFiles ?? [])],
        editorFiles: [...(contextLocal.editorFiles ?? [])],
        networkUrls: [...(contextLocal.networkUrls ?? [])]
    };
}

function cloneModel(model?: TabModel): TabModel {
    const modelLocal = model ?? EMPTY_MODEL;
    const provider = typeof modelLocal.provider === "object"
        ? { ...modelLocal.provider }
        : modelLocal.provider;

    return {
        ...modelLocal,
        provider
    };
}

function normalizeSpawnedList(spawnedList: unknown): File.File.SpawnedList {
    if (Array.isArray(spawnedList)) {
        return {
            list: spawnedList as File.File.SpawnedList["list"],
            config: {
                model: cloneModel(),
                context: cloneContext()
            }
        };
    }

    if (!spawnedList || typeof spawnedList !== "object") {
        return {
            list: [],
            config: {
                model: cloneModel(),
                context: cloneContext()
            }
        };
    }

    const spawnedListRecord = spawnedList as Partial<File.File.SpawnedList>;
    const configRecord = (spawnedListRecord.config ?? {}) as Partial<File.File.SpawnedList["config"]>;

    return {
        list: Array.isArray(spawnedListRecord.list) ? spawnedListRecord.list : [],
        config: {
            model: cloneModel(configRecord.model),
            context: cloneContext(configRecord.context)
        }
    };
}

function getSpawnedListForTab(file: File.File.File | undefined, tab: TabsAvailable): File.File.SpawnedList {
    if (!file) {
        return normalizeSpawnedList(undefined);
    }

    const target = getConfigTargetByTab(tab);
    return normalizeSpawnedList(file[target]);
}

export const selectedTabContext = (() => {
    const selectedContext = derived([selectedTab, selectedFile], ([$selectedTab, $selectedFile]) => {
        const spawnedList = getSpawnedListForTab($selectedFile, $selectedTab);
        return cloneContext(spawnedList.config.context);
    });

    function setContext(context: TabContext) {
        selectedFile.update(file => {
            if (!file) {
                return file;
            }

            const target = getConfigTargetByTab(get(selectedTab));
            const currentSpawnedList = normalizeSpawnedList(file[target]);

            return {
                ...file,
                [target]: {
                    ...currentSpawnedList,
                    config: {
                        ...currentSpawnedList.config,
                        context: cloneContext(context)
                    }
                }
            };
        });
    }

    return {
        subscribe: selectedContext.subscribe,
        set(context: TabContext) {
            setContext(context);
        },
        update(updater: (value: TabContext) => TabContext) {
            const currentContext = get(selectedContext);
            setContext(updater(cloneContext(currentContext)));
        }
    };
})();

export const selectedTabModel = (() => {
    const selectedModelStore = derived([selectedTab, selectedFile], ([$selectedTab, $selectedFile]) => {
        const spawnedList = getSpawnedListForTab($selectedFile, $selectedTab);
        return cloneModel(spawnedList.config.model);
    });

    function setModel(model: TabModel) {
        selectedFile.update(file => {
            if (!file) {
                return file;
            }

            const target = getConfigTargetByTab(get(selectedTab));
            const currentSpawnedList = normalizeSpawnedList(file[target]);

            return {
                ...file,
                [target]: {
                    ...currentSpawnedList,
                    config: {
                        ...currentSpawnedList.config,
                        model: cloneModel(model)
                    }
                }
            };
        });
    }

    return {
        subscribe: selectedModelStore.subscribe,
        set(model: TabModel) {
            setModel(model);
        },
        update(updater: (value: TabModel) => TabModel) {
            const currentModel = get(selectedModelStore);
            setModel(updater(cloneModel(currentModel)));
        }
    };
})();


export interface PlaingFile {
    fileId: string;
    /** Is the platform of user has initialized file playing */
    playByUserId: string;
}

function normalizeExecutionResult(result: File.RoutinesSpikes.FrontendDownloadResultObject): File.RoutinesSpikes.FrontendDownloadResultObject {
    return {
        ...result,
        date: new Date(result.date)
    };
}

type LiveExecutionResultsByFileId = Record<string, File.RoutinesSpikes.FrontendDownloadResultObject[]>;

/** Holds local real-time execution results received through socket events. */
export const liveExecutionResultsStore = (() => {
    const store = writable<LiveExecutionResultsByFileId>({});

    return {
        ...store,
        addResult(fileId: string, result: File.RoutinesSpikes.FrontendDownloadResultObject) {
            if (!fileId) {
                return;
            }

            const normalizedResult = normalizeExecutionResult(result);

            store.update((allResults) => {
                const resultsForFile = allResults[fileId] ?? [];

                return {
                    ...allResults,
                    [fileId]: [normalizedResult, ...resultsForFile]
                };
            });
        },
        getResultsForFile(fileId: string): File.RoutinesSpikes.FrontendDownloadResultObject[] {
            if (!fileId) {
                return [];
            }

            const allResults = get(store);
            return allResults[fileId] ?? [];
        },
        clearFile(fileId: string) {
            if (!fileId) {
                return;
            }

            store.update((allResults) => {
                if (!(fileId in allResults)) {
                    return allResults;
                }

                const nextResults = { ...allResults };
                delete nextResults[fileId];

                return nextResults;
            });
        }
    };
})();

/** Holds files where are the lists are now playing */
export const playingFilesAndTasksListStore = (() => {
    const store = writable<PlaingFile[]>([]);

    return {
        ...store,
        getPlayingByFileId(fileId: string): PlaingFile | undefined {
            if (!fileId) {
                return undefined;
            }

            const allPlayingFiles = get(store);
            return allPlayingFiles.find(unit => unit.fileId === fileId);
        },
        isFilePlaying(fileId: string) {
            const allPlayingFiles = get(store);
            return allPlayingFiles.some(unit => unit.fileId === fileId);
        },
        setFilePlaying(fileId: string, playByUserId: string) {
            if (!fileId || !playByUserId) {
                return;
            }

            store.update((allPlayingFiles) => {
                const withoutCurrentFile = allPlayingFiles.filter(unit => unit.fileId !== fileId);

                return [
                    ...withoutCurrentFile,
                    {
                        fileId,
                        playByUserId
                    }
                ];
            });
        },
        clearFilePlaying(fileId: string) {
            if (!fileId) {
                return;
            }

            store.update((allPlayingFiles) => allPlayingFiles.filter(unit => unit.fileId !== fileId));
        },
        syncFilePlayingState(fileId: string, playByUserId: string | undefined) {
            if (!fileId) {
                return;
            }

            if (!playByUserId) {
                this.clearFilePlaying(fileId);
                return;
            }

            this.setFilePlaying(fileId, playByUserId);
        }
    }
})();
