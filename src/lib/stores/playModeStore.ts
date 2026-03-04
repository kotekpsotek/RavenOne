import { get, writable, type Updater } from "svelte/store";
import { selectedFile, type BrowserToolsUnion, type EditableListItem, type File, type SpawnedList } from "./files";
import { findItemDirectSubitems } from "$lib/listItems/utils";
import type { PlayMode } from "$lib/editorComponents/types/AIList";
import type { AI } from "@ravenlens/shared";

interface PlayableListItem extends Omit<EditableListItem, "answers"> {
    /** Is attached once starts playing -> means point was started */
    startedAtTimestamp?: number;
    /** Is attached once finishes playing -> means point was finished */
    finishedAtTimestamp?: number;
}

interface PlayableSpawnedList extends Omit<SpawnedList, "items"> {
    startedAtTimestamp?: number;
    finishedAtTimestamp?: number;
    items: PlayableListItem[];
}

export interface PlayableList {
    list: PlayableSpawnedList;
    config: {
        model: AI.RavenLensAvaiableAIModel;
        tools: BrowserToolsUnion[];
        selectedItemMcpServers: string[];
        selectedItemPlayMode: PlayMode;
    }
}

export interface EventFinishedPlaying {
    pointId: string;
    startedAtTimestamp: number;
    finishedAtTimestamp: number;
}

interface PlayableDocumentsWithListsAndPoints {
    document: File;
    mode: PlayMode;
    lists: PlayableList[];
    startAtTimestamp: number;
}

export const playableDocumentsAndListsWithPoints = (() => {
    /** Is a has document and set of lists are playing */
    const playableStore = writable<PlayableDocumentsWithListsAndPoints[]>([]);

    return {
        ...playableStore,
        isDocumentPlaying(selectedDocumentLocal: File | undefined) {
            if (!selectedDocumentLocal) {
                return false;
            }

            const storeStateCurrent = get(playableStore);
            return storeStateCurrent?.some(state => state.document.id === selectedDocumentLocal.id) ?? false;
        },
        isPointPlaying(selectedDocumentLocal: File | undefined, listId: string, pointId: string) {
            if (!selectedDocumentLocal) {
                return false;
            }
            
            const storeStateCurrent = get(playableStore);
            const document = storeStateCurrent?.find(state => state.document.id === selectedDocumentLocal.id);
            const list = document?.lists.flatMap(list => list.list).find(document => document.id === listId);
            const point = list?.items.find(item => item.id === pointId);

            return point ? true : false;
        },
        async playPoint(selectedDocumentLocal: File, listId: string, point: EditableListItem, config: PlayableList["config"]) {
            const fileList = selectedDocumentLocal?.lists.find(list => list.id === listId);

            if (!fileList?.items.length) {
                return false;
            }

            // Play lists according to type of list and specified config
            /**
             * * According to list kind:
             * 1. Unordered list / checklist - play first the parents in async mode and then play the subitems
             * 2. Ordered list - play items from upper to down
             * 
             * * Wait for parent finish and then play childs of this point
             * 
             * * 
             */
            const backendPlayPoint = async (point: EditableListItem) => {
                const update: (updator: (item: PlayableListItem, list: PlayableSpawnedList) => void) => Updater<PlayableDocumentsWithListsAndPoints[]> = (updator) => store => {
                    //
                    const documentIndex = store.findIndex(store => store.document.id === selectedDocumentLocal.id);
                    if (documentIndex < 0) {
                        return store;
                    }

                    //
                    const document = store[documentIndex];

                    //
                    const listIndex = document.lists.flatMap(list => list.list).findIndex(list => list.id === listId);
                    if (listIndex < 0) {
                        return store;
                    }

                    //
                    const list = document.lists[listIndex].list;
                    const pointIndex = list.items.findIndex(item => item.id === point.id);
                    if (pointIndex < 0) {
                        return store;
                    }

                    //
                    updator(list.items[pointIndex], list)
                    
                    //
                    return store;
                }

                // Ignore runned points
                if (config.selectedItemPlayMode === "run-non-runned" && point.answers?.length) {
                    alert("Cannot run not-runned-points");
                    return "don-not-allow-to-play-childs";
                }
                
                // Set item as playing
                playableStore.update(update(upd => {
                    upd.startedAtTimestamp = Date.now();
                }))
                
                // FIXME: Make real backend request
                await new Promise<void>(res => setTimeout(res, 5_000));

                // Remove point from playable points since it's finished -> emit event to schedule removal for next 30 sec because we need to show state of finish
                playableStore.update(update((upd, list) => {
                    // Update finish time
                    upd.finishedAtTimestamp = Date.now();

                    // Emit finish event to show finish state for point was runned
                    document.dispatchEvent(new CustomEvent("point-finished", {
                        detail: {
                            pointId: upd.id,
                            startedAtTimestamp: upd.startedAtTimestamp!,
                            finishedAtTimestamp: upd.finishedAtTimestamp,
                        } satisfies EventFinishedPlaying
                    }))

                }));
                
                // Add answer to spawned list from file
                selectedFile.update(sf => {
                    if (!sf || sf.id !== selectedDocumentLocal.id) {
                        return sf;
                    }

                    const now = Date.now();
                    const dummyAnswer: NonNullable<EditableListItem["answers"]>[number] = {
                        playMode: config.selectedItemPlayMode,
                        startDateTimestamp: now - 5_000,
                        endDateTimestamp: now,
                        model: {
                            id: `${config.model.provider}:${config.model.model}`,
                            name: config.model.model,
                            provider: config.model.provider,
                            weight: 1,
                        },
                        context: [],
                        mcp: config.selectedItemMcpServers[0] ?? false,
                        tools: {
                            webSearch: config.tools.includes("Web search")
                        },
                        answerTipTapHTML: "<p>Dummy answer generated by play simulation.</p>"
                    };

                    sf.lists = sf.lists.map(list => {
                        if (list.id !== listId) {
                            return list;
                        }

                        list.items = list.items.map(item => {
                            if (item.id !== point.id) {
                                return item;
                            }

                            item.answers = [...(item.answers ?? []), dummyAnswer];
                            return item;
                        });

                        return list;
                    });

                    return sf;
                })
            }
            const checkPointStateUpdate = (point: EditableListItem, isChecked: boolean) => {
                point.checked = isChecked;

                // Mark selected file as checked
                selectedFile.update(sf => {
                    if (sf) {
                        sf.lists = sf.lists.map(list => {
                            if (list.id === listId) {
                                list.items = list.items.map(item => {
                                    if (item.id === point.id) {
                                        item.checked = isChecked;
                                    }
                                    
                                    return item;
                                })
                            }

                            return list;
                        })
                    }
                    
                    return sf;
                })
            }
            const findChildsFromHigherDepthAndPlay = async (point: EditableListItem): Promise<boolean> => {
                const directSubItems = findItemDirectSubitems(fileList.items, point);
                const asyncPlayTasks: Promise<boolean>[] = [];

                for (const directSubitem of directSubItems) {
                    if (fileList.kind === "ordered") {
                        // Wait for each parent then asynchronously play subppoints = don't wait and go to next parent point to do the same
                        const result = await backendPlayPoint(directSubitem);
                        if (result === "don-not-allow-to-play-childs") {
                            return false;
                        }

                        checkPointStateUpdate(directSubitem, true);

                        const childResult = await findChildsFromHigherDepthAndPlay(directSubitem);
                        if (!childResult) {
                            return false;
                        }
                    }
                    else { // Play in async mode
                        // Play asynchronously parent then subpoints with same mode -> go to subpoints to play
                        const result = backendPlayPoint(directSubitem).then(result => {
                            if (result === "don-not-allow-to-play-childs") {
                                return false;
                            }
                            
                            // Mark as checked the checkpoint
                            checkPointStateUpdate(directSubitem, true);
                            
                            // 
                            return findChildsFromHigherDepthAndPlay(directSubitem);
                        });

                        asyncPlayTasks.push(result);
                    }
                }

                if (asyncPlayTasks.length > 0) {
                    const asyncResults = await Promise.all(asyncPlayTasks);
                    return asyncResults.every(result => result);
                }

                return true;
            };
            
            const currentPlayStartTimestamp = Date.now();

            // 0.5. Set all points as playing but without actual play state - to make them marked as playing
            playableStore.update(store => {
                return [
                    ...store,
                    {
                        document: selectedDocumentLocal,
                        mode: config.selectedItemPlayMode,
                        lists: [
                            {
                                ...fileList,
                                list: {
                                    ...fileList,
                                    items: fileList.items,
                                    startedAtTimestamp: currentPlayStartTimestamp
                                },
                                config: {
                                    model: config.model,
                                    tools: config.tools,
                                    selectedItemMcpServers: config.selectedItemMcpServers,
                                    selectedItemPlayMode: config.selectedItemPlayMode
                                }
                            }
                        ],
                        startAtTimestamp: currentPlayStartTimestamp
                    }
                ];
            });
            
            // 1st play parent
            const result = await backendPlayPoint(point);

            // If this is checklist point mark it as checked
            checkPointStateUpdate(point, true);

            //
            if (result === "don-not-allow-to-play-childs") {
                return false;
            }

            // 2nd play childs from same depth according to type 
            const resultChilds = await findChildsFromHigherDepthAndPlay(point);

            // Wait till all points from this list of store will be finished -> these have the playable store and when are then -> remove list from document of store and whe document in store hasn't got any list then remove this point
            playableStore.update(store => {
                return store
                    .map(documentState => {
                        if (documentState.document.id !== selectedDocumentLocal.id || documentState.startAtTimestamp !== currentPlayStartTimestamp) {
                            return documentState;
                        }

                        const lists = documentState.lists.filter(playableList => {
                            if (playableList.list.id !== listId || playableList.list.startedAtTimestamp !== currentPlayStartTimestamp) {
                                return true;
                            }

                            const startedItems = playableList.list.items.filter(item => item.startedAtTimestamp !== undefined);
                            const areAllStartedItemsFinished = startedItems.length > 0
                                && startedItems.every(item => item.finishedAtTimestamp !== undefined);

                            return !areAllStartedItemsFinished;
                        });

                        return {
                            ...documentState,
                            lists,
                        };
                    })
                    .filter(documentState => documentState.lists.length > 0);
            });

            //
            return resultChilds;
        },
        async stopPlayingPoint(selectedDocumentLocal: File, listId: string, pointId: string) {
            // TODO: Has to stop playing
        }
    }
})();
