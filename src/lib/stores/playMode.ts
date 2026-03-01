import { get, writable } from "svelte/store";
import type { File } from "./files";

export const isPlayingDocuments = (() => {
    const store = writable<string[]>([]);

    return {
        ...store,
        /**
         * Sets file only when doesn't exist already as playing
         * @param file - the file to setup
         * @returns {boolean} - returns the play state
         */
        setFile(file: File): boolean {
            return this.setFileId(file.id);
        },
        setFileId(fileId: string): boolean {
            const state = get(store);

            if (state.includes(fileId)) {
                return false;
            }

            store.update(ids => [...ids, fileId]);
            return true;
        },
        /**
         * Unsets file playing state
         * @param file - is the file supposed to be playing before this action call
         */
        unsetFile(file: File) {
            this.unsetFileId(file.id);
        },
        unsetFileId(fileId: string) {
            store.update(state => state.filter(stateFileId => stateFileId !== fileId));
        },
        /**
         * Checks whether file is playing
         * @param file - file to be check whether is playing
         */
        isFilePlaying(file: File) {
            const state = get(store);
            return state.includes(file.id);
        }
    }
})();
