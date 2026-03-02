import { get, writable } from "svelte/store";
import type { File } from "./files";

export const isPlayingDocuments = (() => {
    const store = writable<File[]>([]);

    return {
        ...store,
        /**
         * Sets file only when doesn't exist already as playing
         * @param file - the file to setup
         * @returns {boolean} - returns the play state
         */
        setFile(file: File): boolean {
            const storeState = get(store);
            const isFilePlaying = storeState.some(storeFile => {
                return storeFile.id === file.id;
            })

            // Check: Is file playing
            if (isFilePlaying) {
                return false;
            }

            // Add file to rest of files
            store.update(files => [...files, file]);
            
            // Return state
            return true;
        },
        /**
         * Unsets file playing state
         * @param file - is the file supposed to be playing before this action call
         */
        unsetFile(file: File) {
            store.update(state => {
                return state.map(fileState => {
                    if (fileState.id === file.id) {
                        return;
                    }

                    return fileState;
                }).filter(v => v !== undefined);
            })
        },
        /**
         * Checks whether file is playing
         * @param file - file to be check whether is playing
         */
        isFilePlaying(file: File) {
            const state = get(store);
            return state.some(stateFile => stateFile.id === file.id);
        }
    }
})();

/**
 * Contains list with playing items and its childs from multiple documents without sorting for document
 * E.g: Playing list items and its belonging nested childrens
*/
export const isPlayingItems = (() => {
    const itemsIdsStore = writable<string[]>([]);

    return {
        ...itemsIdsStore,
        setUpItemPlaying(itemId: string) {
            const state = get(itemsIdsStore);
            if (state.includes(itemId)) {
                return false;
            }

            itemsIdsStore.update(ids => [...ids, itemId]);
            return true;
        },
        unsetItemPlaying(itemId: string) {
            itemsIdsStore.update(state => state.filter(stateItemId => stateItemId !== itemId));
        },
        isItemPlaying(itemId: string) {
            const state = get(itemsIdsStore);
            return state.includes(itemId);
        }
    }
})();
