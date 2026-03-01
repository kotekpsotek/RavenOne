import { writable } from 'svelte/store';

export const hoveredListItemId = writable<string | null>(null);
/** Manages the visibility the tray with items */
export const mouseOutTimeout = (() => {
    const { ...all } = writable<NodeJS.Timeout | null>(null);

    return {
        ...all,
        setTimeout(timeout: number = 300) {
            all.update(() => setTimeout(() => {
                hoveredListItemId.set(null);
            }, timeout))
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