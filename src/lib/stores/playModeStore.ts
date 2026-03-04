import { get, writable } from "svelte/store";
import type { File, SpawnedList } from "./files";
import type { PlayMode } from "$lib/editorComponents/types/AIList";

interface PlayableDocumentsWithListsAndPoints {
    document: File;
    mode: PlayMode;
    lists: SpawnedList[];
}

export const playableDocumentsAndListsWithPoints = (() => {
    /** Is a has document and set of lists are playing */
    const playableStore = writable<PlayableDocumentsWithListsAndPoints[]>();

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
            const list = document?.lists.find(document => document.id === listId);
            const point = list?.items.find(item => item.id === pointId);

            return point ? true : false;
        }   
    }
})();
