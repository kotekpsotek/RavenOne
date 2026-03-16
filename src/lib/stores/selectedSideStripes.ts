import { get, writable } from "svelte/store";
import { isSharedRoute } from "./share";
import { selectedFile } from "./files";

export const isFileListSideStripeSelected = (() => {
    const { ...all } = writable(false);
    return {
        ...all,
        onToggle() {
            // Share state
            const shareState = get(isSharedRoute);
            if (shareState) {
                return;
            }
            
            // Update
            all.update(state => !state);
        }
    }
})();
export const isPointsStripeOpen = (() => {
    const { ...all } = writable(false);

    return {
        ...all,
        onToggle() {
            // File selection state
            const fileSelectionState = get(selectedFile);
            if (!fileSelectionState) {
                return;
            }
            
            // Update
            all.update(state => !state);
        }
    }
})();
export const isChatSideStripeSelected = (() => {
    const { ...all } = writable(false);

    return {
        ...all,
        onToggle() {
            // File selection state
            const fileSelectionState = get(selectedFile);
            if (!fileSelectionState) {
                return;
            }
            
            // Update
            all.update(state => !state);
        }
    }
})();