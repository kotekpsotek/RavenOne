import { get, writable } from "svelte/store";
import { playMode, type File } from "./files";
import { DocumentPlayablePoints } from "$lib/playMode";
import { editor } from "./editor";
import type { PlayMode as PointPlayMode } from "$lib/editorComponents/types/AIList";

export interface PlayPoint {
	pointId: string;
	startTimestamp: number;
}

export interface DocumentPlayPoints {
	document: File;
    startTimestamp: number;
	pointsFromLists: PlayPoint[]
}

export type PointCallFn = (pointId: string, document: File) => Promise<void>;
type PlayModeConfig = false | { playMode: PointPlayMode };

/**
 * Methods of this store are about complex state management and are resposible to communicate with backend to avoid loops, since each point is playing indiciudally and stopped individually
 */
export const playableDocumentsWithPoints = (() => {
    const store = writable<DocumentPlayPoints[]>([]);

    return {
        ...store,
        isDocumentPlaying(checkDocument: File) {
            const currentState = get(store);
            // Not checking pointsList can be usefull for then where is possible to have different items than pointers under what condition the document occurance in store means documents are playing
            return currentState.some(someDocumentState => someDocumentState.document.id === checkDocument.id);
        },
        /**
         * Sets file only when doesn't exist already as playing
         * @param file - the file to setup
         * @param playPointFn - plays point and all subppoints
         * @returns {boolean} - returns the play state
         */
        setFullDocumentPlaying(document: File, playPointFn?: PointCallFn): boolean {
            const editorLocal = get(editor);

            if (!editorLocal) {
                console.error(`Cannot play points while editor isn't initialzied`);
                return false;
            }

            // Check: Is file playing -> Don't allow to play document more than once
            if (this.isDocumentPlaying(document)) {
                return false;
            }

            // Gets the all playable points compilant with play mode
            const allPlayablePointIds = DocumentPlayablePoints.getDocumentAllPlayablePoints(editorLocal, {
                playMode: get(playMode)
            });

            // Play all points
            if (playPointFn) {
                for (const pointId of allPlayablePointIds) {
                    playPointFn(pointId, document)
                        .catch(err => console.error(`Error for point "${pointId}" play operation`, err));
                }
            }

            // Add file to rest of files with all playable points marked as playing
            store.update(documents => [
                ...documents,
                {
                    document: document,
                    startTimestamp: Date.now(),
                    pointsFromLists: allPlayablePointIds.map(point => ({
                        pointId: point,
                        startTimestamp: Date.now()
                    } satisfies PlayPoint)) // 
                }
            ]);
            
            // Return state
            return true;
        },
        // FIXME:
        /**
         * @param stopPointFn - STOPs playing point and all subppoints
         * @param file 
         * @param stopPointFn 
         */
        unsetFullDocumentPlaying(file: File, stopPointFn?: PointCallFn) {
            store.update(state => state.filter(documentState => documentState.document.id !== file.id));
        },
        // ------------------------------
        // --- Below are points state ---
        // ------------------------------
        /**
         * @param playPointFn - plays point and all subppoints
        */
        setUpPointPlaying(selectedDocument: File, pointId: string, playPointFn?: PointCallFn, playModeConfig?: PlayModeConfig) {
            store.update(documentsPlayingList => {
                if (!pointId.trim().length) {
                    console.error("Cannot play point: point id is empty.");
                    return documentsPlayingList;
                }

                const editorLocal = get(editor);
                if (!editorLocal) {
                    console.error(`Editor isn't specified`);
                    return documentsPlayingList;
                }

                const modeConfig: PlayModeConfig = playModeConfig ?? { playMode: get(playMode) };

                const doesPointExistInDocument = DocumentPlayablePoints.doesPlayablePointExists(editorLocal, pointId, false);
                if (!doesPointExistInDocument) {
                    console.error(`Playable point with id: "${pointId}" doesn't exists!`);
                    return documentsPlayingList;
                }

                const doesPlayablePointExist = DocumentPlayablePoints.doesPlayablePointExists(editorLocal, pointId, modeConfig);
                const childPoints = doesPlayablePointExist
                    ? DocumentPlayablePoints.getParentPointPlayableChildPoints(editorLocal, pointId, modeConfig)
                    : [];

                const now = Date.now();
                const incomingPoints: PlayPoint[] = [
                    {
                        pointId,
                        startTimestamp: now
                    },
                    ...childPoints.map(pointElement => ({
                        pointId: pointElement.id,
                        startTimestamp: now
                    } satisfies PlayPoint))
                ];

                const pointIdsToPlay = [
                    pointId,
                    ...childPoints.map(point => point.id)
                ].filter((id, index, list) => Boolean(id) && list.indexOf(id) === index);

                const existingDocumentIndex = documentsPlayingList.findIndex(documentStore => documentStore.document.id === selectedDocument.id);

                if (existingDocumentIndex === -1) {
                    if (playPointFn) {
                        for (const pointToPlayId of pointIdsToPlay) {
                            playPointFn(pointToPlayId, selectedDocument)
                                .catch(err => console.error(`Error for point "${pointToPlayId}" play operation`, err));
                        }
                    }

                    return [
                        ...documentsPlayingList,
                        {
                            document: selectedDocument,
                            startTimestamp: now,
                            pointsFromLists: incomingPoints
                        }
                    ];
                }

                const existingDocument = documentsPlayingList[existingDocumentIndex];
                const existingPointIds = new Set(existingDocument.pointsFromLists.map(point => point.pointId));
                const pointsToAdd = incomingPoints.filter(point => !existingPointIds.has(point.pointId));

                if (!pointsToAdd.length) {
                    return documentsPlayingList;
                }

                if (playPointFn) {
                    for (const pointToPlayId of pointIdsToPlay.filter(id => !existingPointIds.has(id))) {
                        playPointFn(pointToPlayId, selectedDocument)
                            .catch(err => console.error(`Error for point "${pointToPlayId}" play operation`, err));
                    }
                }

                return documentsPlayingList.map((documentState, index) => {
                    if (index !== existingDocumentIndex) {
                        return documentState;
                    }

                    return {
                        ...documentState,
                        pointsFromLists: [...documentState.pointsFromLists, ...pointsToAdd]
                    };
                });
            });
        },
        /**
         * @param stopPointFn - setups point plaing for point and its subpoints
        */
        unsetPointPlaying(pointId: string, selectedDocument: File, stopPointFn?: PointCallFn, playModeConfig?: PlayModeConfig) {
            const editorLocal = get(editor);
            const modeConfig: PlayModeConfig = playModeConfig ?? { playMode: get(playMode) };
            const pointIdsToStop = editorLocal
                ? [
                    pointId,
                    ...DocumentPlayablePoints.getParentPointPlayableChildPoints(editorLocal, pointId, modeConfig).map(point => point.id)
                ].filter((id, index, list) => Boolean(id) && list.indexOf(id) === index)
                : [pointId];

            if (stopPointFn) {
                for (const pointToStopId of pointIdsToStop) {
                    stopPointFn(pointToStopId, selectedDocument)
                        .catch(err => console.error(`Error for point "${pointToStopId}" stop operation`, err));
                }
            }

            store.update(documentsPlayingList => {
                return documentsPlayingList
                    .map(documentState => {
                        const nextPoints = documentState.pointsFromLists.filter(point => !pointIdsToStop.includes(point.pointId));

                        return {
                            ...documentState,
                            pointsFromLists: nextPoints
                        };
                    })
                    .filter(documentState => documentState.pointsFromLists.length > 0);
            });
        },
        isPointPlayingInDocument(selectedDocument: File, pointId: string) {
            const state = get(store);
            const documentState = state.find(documentStore => documentStore.document.id === selectedDocument.id);

            if (!documentState) {
                return false;
            }

            return documentState.pointsFromLists.some(point => point.pointId === pointId);
        },
        getPointPlayable(selectedDocument: File, pointId: string) {
            const state = get(store);
            const documentState = state.find(documentStore => documentStore.document.id === selectedDocument.id);

            if (!documentState) {
                return;
            }

            return documentState.pointsFromLists.find(point => point.pointId === pointId);
        }
    }
})();
