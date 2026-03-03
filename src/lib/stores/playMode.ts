import { get, writable } from "svelte/store";
import { playMode, type File } from "./files";
import { DocumentPlayablePoints } from "$lib/playMode";
import { editor } from "./editor";
import type { PlayMode as PointPlayMode } from "$lib/editorComponents/types/AIList";
import type { Editor, Editor as TipTapEditor } from "svelte-tiptap";

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
interface UnsetPointOptions {
    includeChildPoints?: boolean;
}

/**
 * Methods of this store are about complex state management and are resposible to communicate with backend to avoid loops, since each point is playing indiciudally and stopped individually
 */
export const playableDocumentsWithPoints = (() => {
    const store = writable<DocumentPlayPoints[]>([]);

    function isPlayablePointEmpty(editorLocal: TipTapEditor, pointId: string) {
        const pointElement = DocumentPlayablePoints.getElementIsPlayablePoint(editorLocal, pointId);

        if (!pointElement) {
            return true;
        }

        const pointClone = pointElement.cloneNode(true) as HTMLElement;
        pointClone.querySelectorAll('ul, ol').forEach(list => list.remove());

        const normalizedTextContent = (pointClone.textContent ?? "")
            .replaceAll('\u200B', '')
            .trim();

        const hasMeaningfulNonTextContent = !!pointClone.querySelector('img, video, audio, svg, pre, code, table, iframe, canvas, blockquote');

        return !normalizedTextContent.length && !hasMeaningfulNonTextContent;
    }

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
        // TODO: Don't allow to  play subpoints are empty nor empty point -> use commnet to mark where is logic for empty point and where is for empty subpoints
        setFullDocumentPlaying(document: File, editorLocal: Editor, playPointFn?: PointCallFn): boolean | "empty-points-are-not-playable" {
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

            // Empty point logic (in full-document mode it applies for points and subpoints).
            const nonEmptyPlayablePointIds = allPlayablePointIds.filter(pointId => !isPlayablePointEmpty(editorLocal, pointId));

            if (!nonEmptyPlayablePointIds.length) {
                return "empty-points-are-not-playable";
            }

            // Play all points
            if (playPointFn) {
                for (const pointId of nonEmptyPlayablePointIds) {
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
                    pointsFromLists: nonEmptyPlayablePointIds.map(point => ({
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
            if (stopPointFn) {
                const currentState = get(store);
                const documentState = currentState.find(state => state.document.id === file.id);

                if (documentState) {
                    const pointIdsToStop = documentState.pointsFromLists
                        .map(point => point.pointId)
                        .filter((id, index, list) => Boolean(id) && list.indexOf(id) === index);

                    for (const pointId of pointIdsToStop) {
                        stopPointFn(pointId, file)
                            .catch(err => console.error(`Error for point "${pointId}" stop operation`, err));
                    }
                }
            }

            store.update(state => state.filter(documentState => documentState.document.id !== file.id));
        },
        // ------------------------------
        // --- Below are points state ---
        // ------------------------------
        /**
         * @param playPointFn - plays point and all subppoints
        */
        // TODO: Don't allow to  play subpoints are empty nor empty point -> use commnet to mark where is logic for empty point and where is for empty subpoints
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

                // Empty point logic (for the selected parent point).
                const isParentPointEmpty = isPlayablePointEmpty(editorLocal, pointId);

                // Empty subpoints logic (for child points under the selected parent point).
                const playableChildPoints = childPoints.filter(pointElement => !isPlayablePointEmpty(editorLocal, pointElement.id));

                const now = Date.now();
                const incomingPoints: PlayPoint[] = [
                    ...(!isParentPointEmpty ? [{
                        pointId,
                        startTimestamp: now
                    }] : []),
                    ...playableChildPoints.map(pointElement => ({
                        pointId: pointElement.id,
                        startTimestamp: now
                    } satisfies PlayPoint))
                ];

                if (!incomingPoints.length) {
                    console.error(`Cannot play point: point "${pointId}" and all its subpoints are empty.`);
                    return documentsPlayingList;
                }

                const pointIdsToPlay = [
                    ...(!isParentPointEmpty ? [pointId] : []),
                    ...playableChildPoints.map(point => point.id)
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
        unsetPointPlaying(
            pointId: string,
            selectedDocument: File,
            stopPointFn?: PointCallFn,
            playModeConfig?: PlayModeConfig,
            options?: UnsetPointOptions
        ) {
            const editorLocal = get(editor);
            const modeConfig: PlayModeConfig = playModeConfig ?? { playMode: get(playMode) };
            const includeChildPoints = options?.includeChildPoints ?? true;
            const childPointIds = includeChildPoints && editorLocal
                ? DocumentPlayablePoints.getParentPointPlayableChildPoints(editorLocal, pointId, modeConfig).map(point => point.id)
                : [];
            const pointIdsToStop = [
                pointId,
                ...childPointIds
            ].filter((id, index, list) => Boolean(id) && list.indexOf(id) === index);

            if (stopPointFn) {
                for (const pointToStopId of pointIdsToStop) {
                    stopPointFn(pointToStopId, selectedDocument)
                        .catch(err => console.error(`Error for point "${pointToStopId}" stop operation`, err));
                }
            }

            store.update(documentsPlayingList => {
                return documentsPlayingList
                    .map(documentState => {
                        if (documentState.document.id !== selectedDocument.id) {
                            return documentState;
                        }

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
