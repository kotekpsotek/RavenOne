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
