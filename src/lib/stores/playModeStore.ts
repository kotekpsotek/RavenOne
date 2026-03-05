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
    /** Points that belong to this run scope (used by UI planned/omitted badges). */
    scopePointIds: string[];
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

interface CancelEvent {
    listId: string;
    pointId: string;
}

export class CancelPointEvent {
    static EventName = "cancel-point"
    
    static dispatch(listId: string, pointId: string) {
        document.dispatchEvent(new CustomEvent(
            CancelPointEvent.EventName,
            {
                detail: {
                    listId,
                    pointId
                } satisfies CancelEvent
            }
        ));
    }

    static listen(callback: (listId: string, pointId: string) => void) {
        document.addEventListener(CancelPointEvent.EventName, ev => {
            const det = (ev as CustomEvent).detail as CancelEvent;
            callback(det.listId, det.pointId)
        });
    }
}

interface DocumentEvent {
    kind: "document";
    document: File;
}

interface PointEvent {
    kind: "point";
    document: File;
    listId: string;
    pointId: string;
}

export class PlayEvent {
    static EventName = "play-event"
    
    static dispatch(event: DocumentEvent | PointEvent) {
        document.dispatchEvent(new CustomEvent(
            PlayEvent.EventName,
            {
                detail: event
            }
        ));
    }

    static listen(callback: (targetEvent: DocumentEvent | PointEvent) => void) {
        const listener = (ev: Event) => callback((ev as CustomEvent).detail);
        document.addEventListener(PlayEvent.EventName, listener);

        return () => {
            document.removeEventListener(PlayEvent.EventName, listener);
        };
    }
}

interface StopDocumentEvent {
    kind: "document";
    document: File;
}

interface StopPointEvent {
    kind: "point";
    document: File;
    listId: string;
    pointId: string;
}

interface PlayPointOptions {
    waitForSubtreeCompletion?: boolean;
    /** Optional UI scope override. Defaults to the played point subtree. */
    scopePointIds?: string[];
}

export class StopPlayEvent {
    static EventName = "stop-play-event"
    
    static dispatch(event: StopDocumentEvent | StopPointEvent) {
        document.dispatchEvent(new CustomEvent(
            StopPlayEvent.EventName,
            {
                detail: event
            }
        ));
    }

    static listen(callback: (targetEvent: StopDocumentEvent | StopPointEvent) => void) {
        const listener = (ev: Event) => callback((ev as CustomEvent).detail);
        document.addEventListener(StopPlayEvent.EventName, listener);

        return () => {
            document.removeEventListener(StopPlayEvent.EventName, listener);
        };
    }
}

export const playableDocumentsAndListsWithPoints = (() => {
    /** Is a has document and set of lists are playing */
    const playableStore = writable<PlayableDocumentsWithListsAndPoints[]>([]);
    const playDocumentRunVersions = new Map<string, number>();
    let lastPlayStartTimestamp = 0;

    const beginDocumentRun = (documentId: string) => {
        const nextVersion = (playDocumentRunVersions.get(documentId) ?? 0) + 1;
        playDocumentRunVersions.set(documentId, nextVersion);
        return nextVersion;
    };

    const isCurrentDocumentRun = (documentId: string, version: number) => {
        return (playDocumentRunVersions.get(documentId) ?? 0) === version;
    };

    const createPlayStartTimestamp = () => {
        const now = Date.now();
        lastPlayStartTimestamp = now > lastPlayStartTimestamp ? now : lastPlayStartTimestamp + 1;
        return lastPlayStartTimestamp;
    };

    // Some persisted documents may store checklist kinds other than literal "task".
    const isTaskLikeListKind = (kind: string) => {
        return kind !== "ordered" && kind !== "unordered";
    };

    const hasPointTextContent = (point: EditableListItem) => {
        return point.text.trim().length > 0;
    };

    const isPointPlayableByContent = (items: EditableListItem[], pointId: string) => {
        const pointIndex = items.findIndex(item => item.id === pointId);
        if (pointIndex < 0) {
            return false;
        }

        if (hasPointTextContent(items[pointIndex])) {
            return true;
        }

        const pointDepth = items[pointIndex].depth;
        for (let index = pointIndex + 1; index < items.length; index += 1) {
            const currentPoint = items[index];
            if (currentPoint.depth <= pointDepth) {
                break;
            }

            if (hasPointTextContent(currentPoint)) {
                return true;
            }
        }

        return false;
    };

    const isRunNonRunnedMode = (playMode: string) => {
        return playMode === "run-non-runned" || playMode === "run-not-runned";
    };

    const hasPointAnswers = (point: EditableListItem) => {
        return (point.answers?.length ?? 0) > 0;
    };

    const hasPlayableDescendants = (items: EditableListItem[], point: EditableListItem) => {
        const directSubItems = findItemDirectSubitems(items, point);

        for (const directSubItem of directSubItems) {
            if (!isPointPlayableByContent(items, directSubItem.id)) {
                continue;
            }

            return true;
        }

        return false;
    };

    const shouldSchedulePointByPlayMode = (
        items: EditableListItem[],
        point: EditableListItem,
        selectedItemPlayMode: string
    ) => {
        if (!isPointPlayableByContent(items, point.id)) {
            return false;
        }

        if (!isRunNonRunnedMode(selectedItemPlayMode)) {
            return true;
        }

        if (hasPointAnswers(point)) {
            return false;
        }

        // In "run-not-runned" mode, run unresolved points with own text even if they have children.
        // Keep omitting pure container points (no own text) so only meaningful content is scheduled.
        if (hasPointTextContent(point)) {
            return true;
        }

        return !hasPlayableDescendants(items, point);
    };

    const collectSchedulableSubtreePoints = (
        items: EditableListItem[],
        point: EditableListItem,
        selectedItemPlayMode: string
    ): EditableListItem[] => {
        const directSubItems = findItemDirectSubitems(items, point);
        const childPoints = directSubItems.flatMap(subPoint => {
            return collectSchedulableSubtreePoints(items, subPoint, selectedItemPlayMode);
        });

        if (shouldSchedulePointByPlayMode(items, point, selectedItemPlayMode)) {
            return [point, ...childPoints];
        }

        return childPoints;
    };

    const collectPointSubtreeIds = (items: EditableListItem[], pointId: string) => {
        const pointIndex = items.findIndex(item => item.id === pointId);
        if (pointIndex < 0) {
            return [];
        }

        const rootPoint = items[pointIndex];
        const subtreePointIds = [rootPoint.id];
        for (let index = pointIndex + 1; index < items.length; index += 1) {
            const currentPoint = items[index];
            if (currentPoint.depth <= rootPoint.depth) {
                break;
            }

            subtreePointIds.push(currentPoint.id);
        }

        return subtreePointIds;
    };

    const getRunScopePointIds = (playableList: PlayableList) => {
        return playableList.scopePointIds?.length
            ? playableList.scopePointIds
            : playableList.list.items.map(item => item.id);
    };

    return {
        ...playableStore,
        isDocumentPlaying(selectedDocumentLocal: File | undefined) {
            if (!selectedDocumentLocal) {
                return false;
            }

            const storeStateCurrent = get(playableStore);
            return storeStateCurrent?.some(state => state.document.id === selectedDocumentLocal.id) ?? false;
        },
        isSomePointPlayingInSomeList(selectedDocumentLocal?: File) {
            const storeStateCurrent = get(playableStore);
            const documentStates = selectedDocumentLocal
                ? storeStateCurrent.filter(state => state.document.id === selectedDocumentLocal.id)
                : storeStateCurrent;

            return documentStates.some(state => {
                return state.lists.some(playableList => playableList.list.items.length > 0);
            });
        },
        isSomePointPlayingInThisList(selectedDocumentLocal: File | undefined, listId: string) {
            if (!selectedDocumentLocal) {
                return false;
            }

            const storeStateCurrent = get(playableStore);

            return storeStateCurrent
                .filter(state => state.document.id === selectedDocumentLocal.id)
                .some(state => {
                    return state.lists
                        .filter(playableList => playableList.list.id === listId)
                        .some(playableList => playableList.list.items.length > 0);
                });
        },
        isPointPlayable(selectedDocumentLocal: File | undefined, listId: string, pointId: string) {
            if (!selectedDocumentLocal) {
                return false;
            }

            const fileList = selectedDocumentLocal.lists.find(list => list.id === listId);
            if (!fileList?.items.length) {
                return false;
            }

            return isPointPlayableByContent(fileList.items, pointId);
        },
        isPointInCurrentPlayScope(selectedDocumentLocal: File | undefined, listId: string, pointId: string) {
            if (!selectedDocumentLocal) {
                return false;
            }

            const storeStateCurrent = get(playableStore);
            return storeStateCurrent
                .filter(state => state.document.id === selectedDocumentLocal.id)
                .flatMap(state => state.lists)
                .filter(playableList => playableList.list.id === listId)
                .some(playableList => getRunScopePointIds(playableList).includes(pointId));
        },
        isPointMatchingCurrentPlayMode(selectedDocumentLocal: File | undefined, listId: string, pointId: string) {
            if (!selectedDocumentLocal) {
                return false;
            }

            const fileList = selectedDocumentLocal.lists.find(list => list.id === listId);
            if (!fileList?.items.length) {
                return false;
            }

            const point = fileList.items.find(item => item.id === pointId);
            if (!point) {
                return false;
            }

            const storeStateCurrent = get(playableStore);
            const activeScopedListRuns = storeStateCurrent
                .filter(state => state.document.id === selectedDocumentLocal.id)
                .flatMap(state => state.lists)
                .filter(playableList => playableList.list.id === listId)
                .filter(playableList => getRunScopePointIds(playableList).includes(pointId));

            if (!activeScopedListRuns.length) {
                return isPointPlayableByContent(fileList.items, pointId);
            }

            return activeScopedListRuns.some(playableList => {
                return shouldSchedulePointByPlayMode(
                    fileList.items,
                    point,
                    playableList.config.selectedItemPlayMode
                );
            });
        },
        isPointPlaying(selectedDocumentLocal: File | undefined, listId: string, pointId: string) {
            if (!selectedDocumentLocal) {
                return false;
            }
            
            const storeStateCurrent = get(playableStore);
            return storeStateCurrent
                .filter(state => state.document.id === selectedDocumentLocal.id)
                .some(state => {
                    return state.lists
                        .filter(playableList => playableList.list.id === listId)
                        .some(playableList => {
                            return playableList.list.items.some(item => item.id === pointId);
                        });
                });
        },
        isPointActivelyPlaying(selectedDocumentLocal: File | undefined, listId: string, pointId: string) {
            if (!selectedDocumentLocal) {
                return false;
            }
            
            const storeStateCurrent = get(playableStore);
            const points = storeStateCurrent
                .filter(state => state.document.id === selectedDocumentLocal.id)
                .flatMap(state => {
                    return state.lists
                        .filter(playableList => playableList.list.id === listId)
                        .flatMap(playableList => playableList.list.items)
                        .filter(item => item.id === pointId);
                });

            if (points.some(point => point.startedAtTimestamp !== undefined && point.finishedAtTimestamp === undefined)) {
                return true;
            }

            if (points.some(point => point.finishedAtTimestamp !== undefined)) {
                return "finished";
            }

            return false;
        },
        isPointParentPlaying(selectedDocumentLocal: File | undefined, listId: string, pointId: string) {
            if (!selectedDocumentLocal) {
                return false;
            }

            const fileList = selectedDocumentLocal.lists.find(list => list.id === listId);
            if (!fileList?.items.length) {
                return false;
            }

            const pointIndex = fileList.items.findIndex(item => item.id === pointId);
            if (pointIndex < 0) {
                return false;
            }

            const ancestorPointIds = new Set<string>();
            let currentDepth = fileList.items[pointIndex].depth;

            for (let index = pointIndex - 1; index >= 0; index -= 1) {
                if (currentDepth <= 0) {
                    break;
                }

                const currentPoint = fileList.items[index];
                if (currentPoint.depth < currentDepth) {
                    ancestorPointIds.add(currentPoint.id);
                    currentDepth = currentPoint.depth;
                }
            }

            if (ancestorPointIds.size === 0) {
                return false;
            }

            const storeStateCurrent = get(playableStore);
            return storeStateCurrent
                .filter(state => state.document.id === selectedDocumentLocal.id)
                .some(state => {
                    return state.lists
                        .filter(playableList => playableList.list.id === listId)
                        .some(playableList => {
                            return playableList.list.items.some(item => ancestorPointIds.has(item.id));
                        });
                });
        },
        isPointSomeChildPlaying(selectedDocumentLocal: File | undefined, listId: string, pointId: string) {
            if (!selectedDocumentLocal) {
                return false;
            }

            const fileList = selectedDocumentLocal.lists.find(list => list.id === listId);
            if (!fileList?.items.length) {
                return false;
            }

            const parentPointIndex = fileList.items.findIndex(item => item.id === pointId);
            if (parentPointIndex < 0) {
                return false;
            }

            const parentDepth = fileList.items[parentPointIndex].depth;
            const childPointIds = new Set<string>();

            for (let index = parentPointIndex + 1; index < fileList.items.length; index += 1) {
                const currentPoint = fileList.items[index];

                if (currentPoint.depth <= parentDepth) {
                    break;
                }

                childPointIds.add(currentPoint.id);
            }

            if (childPointIds.size === 0) {
                return false;
            }

            const storeStateCurrent = get(playableStore);
            return storeStateCurrent
                .filter(state => state.document.id === selectedDocumentLocal.id)
                .some(state => {
                    return state.lists
                        .filter(playableList => playableList.list.id === listId)
                        .some(playableList => {
                            return playableList.list.items.some(item => childPointIds.has(item.id));
                        });
                });
        },
        async playDocument(selectedDocumentLocal: File, config: PlayableList["config"]) {
            if (!selectedDocumentLocal?.lists?.length) {
                return false;
            }

            let hasAnyPointStarted = false;
            const playDocumentRunVersion = beginDocumentRun(selectedDocumentLocal.id);

            const playRootPoint = async (
                listId: string,
                rootPoint: EditableListItem,
                options?: PlayPointOptions
            ) => {
                if (!isCurrentDocumentRun(selectedDocumentLocal.id, playDocumentRunVersion)) {
                    return false;
                }

                if (playableDocumentsAndListsWithPoints.isPointPlaying(selectedDocumentLocal, listId, rootPoint.id)) {
                    return false;
                }

                const sourceList = selectedDocumentLocal.lists.find(list => list.id === listId);
                if (!sourceList?.items.length || !isPointPlayableByContent(sourceList.items, rootPoint.id)) {
                    return false;
                }

                const rootSchedulablePoints = collectSchedulableSubtreePoints(
                    sourceList.items,
                    rootPoint,
                    config.selectedItemPlayMode
                );
                if (!rootSchedulablePoints.length) {
                    return false;
                }

                const result = await playableDocumentsAndListsWithPoints.playPoint(
                    selectedDocumentLocal,
                    listId,
                    rootPoint,
                    config,
                    options
                );

                if (!isCurrentDocumentRun(selectedDocumentLocal.id, playDocumentRunVersion)) {
                    return false;
                }

                return result;
            };
            
            // Emit play event
            PlayEvent.dispatch({
                kind: "document",
                document: selectedDocumentLocal
            } satisfies DocumentEvent);
            
            // Play point by point
            for (const list of selectedDocumentLocal.lists) {
                if (!isCurrentDocumentRun(selectedDocumentLocal.id, playDocumentRunVersion)) {
                    return hasAnyPointStarted;
                }

                if (!list.items.length) {
                    continue;
                }

                const topDepth = Math.min(...list.items.map(item => item.depth));
                const rootPoints = list.items.filter(item => item.depth === topDepth);
                if (!rootPoints.length) {
                    continue;
                }

                const listScopePointIds = list.items.map(item => item.id);

                if (list.kind === "ordered") {
                    for (const rootPoint of rootPoints) {
                        const result = await playRootPoint(list.id, rootPoint, {
                            waitForSubtreeCompletion: false,
                            scopePointIds: listScopePointIds
                        });

                        if (!isCurrentDocumentRun(selectedDocumentLocal.id, playDocumentRunVersion)) {
                            return hasAnyPointStarted;
                        }

                        if (result) {
                            hasAnyPointStarted = true;
                        }
                    }

                    continue;
                }

                const results = await Promise.all(
                    rootPoints.map(rootPoint => playRootPoint(list.id, rootPoint, {
                        scopePointIds: listScopePointIds
                    }))
                );

                if (!isCurrentDocumentRun(selectedDocumentLocal.id, playDocumentRunVersion)) {
                    return hasAnyPointStarted;
                }

                if (results.some(result => result)) {
                    hasAnyPointStarted = true;
                }
            }

            return hasAnyPointStarted;
        },
        /** Launches point playing and its subpoints */
        async playPoint(
            selectedDocumentLocal: File,
            listId: string,
            point: EditableListItem,
            config: PlayableList["config"],
            options?: PlayPointOptions
        ) {
            const fileList = selectedDocumentLocal?.lists.find(list => list.id === listId);
            const waitForSubtreeCompletion = options?.waitForSubtreeCompletion ?? true;

            if (!fileList?.items.length) {
                return false;
            }

            if (!isPointPlayableByContent(fileList.items, point.id)) {
                return false;
            }

            const currentPlayStartTimestamp = createPlayStartTimestamp();
            let wasRunFinalized = false;
            let hasAnyPointStartedInRun = false;

            const pointsForScheduling = collectSchedulableSubtreePoints(
                fileList.items,
                point,
                config.selectedItemPlayMode
            );
            if (pointsForScheduling.length === 0) {
                return false;
            }

            const pointsForSchedulingIds = new Set(pointsForScheduling.map(item => item.id));
            const runScopePointIds = options?.scopePointIds?.length
                ? Array.from(new Set(options.scopePointIds))
                : collectPointSubtreeIds(fileList.items, point.id);
            if (runScopePointIds.length === 0) {
                return false;
            }

            const isPointPlayingInCurrentRun = (pointId: string) => {
                const storeStateCurrent = get(playableStore);
                const documentState = storeStateCurrent.find(document => {
                    return document.document.id === selectedDocumentLocal.id && document.startAtTimestamp === currentPlayStartTimestamp;
                });
                if (!documentState) {
                    return false;
                }

                const listState = documentState.lists.find(playableList => {
                    return playableList.list.id === listId && playableList.list.startedAtTimestamp === currentPlayStartTimestamp;
                });
                if (!listState) {
                    return false;
                }

                return listState.list.items.some(item => item.id === pointId);
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
            const backendPlayPoint = async (point: EditableListItem): Promise<true | "don-not-allow-to-play-childs"> => {
                if (!pointsForSchedulingIds.has(point.id)) {
                    return "don-not-allow-to-play-childs";
                }

                if (!isPointPlayingInCurrentRun(point.id)) {
                    return "don-not-allow-to-play-childs";
                }

                const update: (updator: (item: PlayableListItem, list: PlayableSpawnedList) => void) => Updater<PlayableDocumentsWithListsAndPoints[]> = (updator) => store => {
                    //
                    const documentIndex = store.findIndex(store => {
                        return store.document.id === selectedDocumentLocal.id && store.startAtTimestamp === currentPlayStartTimestamp;
                    });
                    if (documentIndex < 0) {
                        return store;
                    }

                    //
                    const document = store[documentIndex];

                    //
                    const listIndex = document.lists.findIndex(playableList => {
                        return playableList.list.id === listId && playableList.list.startedAtTimestamp === currentPlayStartTimestamp;
                    });
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

                hasAnyPointStartedInRun = true;
                
                // Set item as playing
                playableStore.update(update(upd => {
                    upd.startedAtTimestamp = Date.now();
                    upd.finishedAtTimestamp = undefined;
                }))
                
                //
                PlayEvent.dispatch({
                    kind: "point",
                    document: selectedDocumentLocal,
                    listId,
                    pointId: point.id
                });
                
                // FIXME: Make real backend request
                await new Promise<void>(res => setTimeout(res, 5000));

                if (!isPointPlayingInCurrentRun(point.id)) {
                    return "don-not-allow-to-play-childs";
                }

                // Remove point from playable points since it's finished -> emit event to schedule removal for next 30 sec because we need to show state of finish
                playableStore.update(update((upd, list) => {
                    // Update finish time
                    upd.finishedAtTimestamp = Date.now();
                }));

                if (!isPointPlayingInCurrentRun(point.id)) {
                    return "don-not-allow-to-play-childs";
                }

                // Every played checkpoint should become checked after execution.
                checkPointStateUpdate(point, true);
                
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

                    return {
                        ...sf,
                        lists: sf.lists.map(list => {
                            if (list.id !== listId) {
                                return list;
                            }

                            return {
                                ...list,
                                items: list.items.map(item => {
                                    if (item.id !== point.id) {
                                        return item;
                                    }

                                    return {
                                        ...item,
                                        checked: isTaskLikeListKind(list.kind) ? true : item.checked,
                                        answers: [...(item.answers ?? []), dummyAnswer],
                                    };
                                })
                            };
                        })
                    };
                })

                return true;
            }
            const checkPointStateUpdate = (point: EditableListItem, isChecked: boolean) => {
                if (!isTaskLikeListKind(fileList.kind)) {
                    return;
                }

                point.checked = isChecked;

                // Mark selected file as checked
                selectedFile.update(sf => {
                    if (!sf || sf.id !== selectedDocumentLocal.id) {
                        return sf;
                    }

                    return {
                        ...sf,
                        lists: sf.lists.map(list => {
                            if (list.id !== listId) {
                                return list;
                            }

                            return {
                                ...list,
                                items: list.items.map(item => {
                                    if (item.id !== point.id) {
                                        return item;
                                    }

                                    return {
                                        ...item,
                                        checked: isChecked,
                                    };
                                })
                            };
                        })
                    };
                })
            }
            const finalizeCurrentRun = () => {
                if (wasRunFinalized) {
                    return;
                }

                wasRunFinalized = true;

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
                                const hasNoStartedItems = startedItems.length === 0;
                                const areAllStartedItemsFinished = startedItems.every(item => item.finishedAtTimestamp !== undefined);

                                return !(hasNoStartedItems || areAllStartedItemsFinished);
                            });

                            return {
                                ...documentState,
                                lists,
                            };
                        })
                        .filter(documentState => documentState.lists.length > 0);
                });
            };
            const playPointIfSchedulable = async (point: EditableListItem) => {
                if (!pointsForSchedulingIds.has(point.id)) {
                    return true;
                }

                const result = await backendPlayPoint(point);
                if (result === "don-not-allow-to-play-childs") {
                    return false;
                }

                checkPointStateUpdate(point, true);
                return true;
            };
            const findChildsFromHigherDepthAndPlay = async (point: EditableListItem): Promise<boolean> => {
                const directSubItems = findItemDirectSubitems(fileList.items, point);
                if (!directSubItems.length) {
                    return true;
                }

                if (fileList.kind === "ordered") {
                    const nestedTasks: Promise<boolean>[] = [];

                    for (const directSubitem of directSubItems) {
                        if (!isPointPlayableByContent(fileList.items, directSubitem.id)) {
                            continue;
                        }

                        // Keep ordered siblings sequential, but let each subtree continue in background.
                        const result = await playPointIfSchedulable(directSubitem);
                        if (!result) {
                            return false;
                        }

                        nestedTasks.push(findChildsFromHigherDepthAndPlay(directSubitem));
                    }

                    const nestedResults = await Promise.all(nestedTasks);
                    return nestedResults.every(result => result);
                }

                const asyncPlayTasks: Promise<boolean>[] = [];

                for (const directSubitem of directSubItems) {
                    if (!isPointPlayableByContent(fileList.items, directSubitem.id)) {
                        continue;
                    }

                    const result = playPointIfSchedulable(directSubitem).then(result => {
                        if (!result) {
                            return false;
                        }

                        // 
                        return findChildsFromHigherDepthAndPlay(directSubitem);
                    });

                    asyncPlayTasks.push(result);
                }

                const asyncResults = await Promise.all(asyncPlayTasks);
                return asyncResults.every(result => result);
            };

            const toPlayableItem = (item: EditableListItem): PlayableListItem => ({
                ...item,
                startedAtTimestamp: undefined,
                finishedAtTimestamp: undefined
            });

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
                                    items: pointsForScheduling.map(toPlayableItem),
                                    startedAtTimestamp: currentPlayStartTimestamp
                                },
                                config: {
                                    model: config.model,
                                    tools: config.tools,
                                    selectedItemMcpServers: config.selectedItemMcpServers,
                                    selectedItemPlayMode: config.selectedItemPlayMode
                                },
                                scopePointIds: runScopePointIds
                            }
                        ],
                        startAtTimestamp: currentPlayStartTimestamp
                    }
                ];
            });

            if (!waitForSubtreeCompletion) {
                const pointPlayResult = await playPointIfSchedulable(point);
                if (!pointPlayResult) {
                    finalizeCurrentRun();
                    return false;
                }

                const childPlayTask = findChildsFromHigherDepthAndPlay(point)
                    .finally(() => {
                        finalizeCurrentRun();
                    });

                void childPlayTask;
                return pointsForSchedulingIds.size > 0;
            }

            const pointAndChildPlayTask = (async () => {
                const pointPlayResult = await playPointIfSchedulable(point);
                if (!pointPlayResult) {
                    return false;
                }

                return findChildsFromHigherDepthAndPlay(point);
            })()
                .finally(() => {
                    finalizeCurrentRun();
                });

            await pointAndChildPlayTask;
            return hasAnyPointStartedInRun;
        },
        /** Stop point playing and its subpoints */
        async stopPlayingPoint(selectedDocumentLocal: File, listId: string, pointId: string) {
            const fileList = selectedDocumentLocal?.lists.find(list => list.id === listId);
            const pointsToStop = new Set<string>([pointId]);

            const findSubpointsAndNestedWithPoint = (items: EditableListItem[], point: EditableListItem) => {
                const directSubitems = findItemDirectSubitems(items, point);

                for (const subitem of directSubitems) {
                    pointsToStop.add(subitem.id);
                    findSubpointsAndNestedWithPoint(items, subitem);
                }
            }

            if (fileList?.items.length) {
                const initialPoint = fileList.items.find(item => item.id === pointId);

                if (initialPoint) {
                    findSubpointsAndNestedWithPoint(fileList.items, initialPoint);
                }
            }

            const storeStateCurrent = get(playableStore);
            for (const documentState of storeStateCurrent) {
                if (documentState.document.id !== selectedDocumentLocal.id) {
                    continue;
                }

                for (const playableList of documentState.lists) {
                    if (playableList.list.id !== listId) {
                        continue;
                    }

                    const initialPoint = playableList.list.items.find(item => item.id === pointId);
                    if (!initialPoint) {
                        continue;
                    }

                    findSubpointsAndNestedWithPoint(playableList.list.items, initialPoint);
                }
            }

            let hasChanges = false;
            playableStore.update(store => {
                const updatedStore = store
                    .map(documentState => {
                        if (documentState.document.id !== selectedDocumentLocal.id) {
                            return documentState;
                        }

                        let hasDocumentChanges = false;
                        const updatedLists = documentState.lists
                            .map(playableList => {
                                if (playableList.list.id !== listId) {
                                    return playableList;
                                }

                                const updatedItems = playableList.list.items.filter(item => {
                                    if (!pointsToStop.has(item.id)) {
                                        return true
                                    }
                                    else {
                                        CancelPointEvent.dispatch(playableList.list.id, item.id);
                                        return false;
                                    }
                                });
                                if (updatedItems.length !== playableList.list.items.length) {
                                    hasDocumentChanges = true;
                                }

                                return {
                                    ...playableList,
                                    list: {
                                        ...playableList.list,
                                        items: updatedItems,
                                    }
                                };
                            })
                            .filter(playableList => {
                                const shouldKeepList = playableList.list.items.length > 0;
                                if (!shouldKeepList) {
                                    hasDocumentChanges = true;
                                }

                                return shouldKeepList;
                            });

                        if (updatedLists.length === 0) {
                            hasChanges = true;
                            return null;
                        }

                        if (!hasDocumentChanges) {
                            return documentState;
                        }

                        hasChanges = true;
                        return {
                            ...documentState,
                            lists: updatedLists,
                        };
                    })
                    .filter((documentState): documentState is PlayableDocumentsWithListsAndPoints => documentState !== null);

                return hasChanges ? updatedStore : store;
            });

            return hasChanges;
        },
        stopPlayingDocument(document: File) {
            let hasChanges = false;
            beginDocumentRun(document.id);

            playableStore.update(store => {
                const updatedStore = store.filter(documentState => documentState.document.id !== document.id);
                hasChanges = updatedStore.length !== store.length;

                return hasChanges ? updatedStore : store;
            });

            if (hasChanges) {
                StopPlayEvent.dispatch({
                    kind: "document",
                    document
                } satisfies StopDocumentEvent);
            }

            return hasChanges;
        }
    }
})();
