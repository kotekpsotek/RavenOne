import { writable } from 'svelte/store';

export const hoveredListItemId = writable<string | null>(null);
/** Manages the visibility the tray with items */
export const mouseOutTimeout = (() => {
    const { ...all } = writable<NodeJS.Timeout | null>(null);

    return {
        ...all,
        setTimeout() {
            all.update(() => setTimeout(() => {
                hoveredListItemId.set(null);
            }, 400))
        },
        clearTimeout() {
            all.update(timeout => {
                if (timeout) {
                    clearTimeout(timeout);
                    return null;
                }
                
                return null;
            })
        }
    }
})();