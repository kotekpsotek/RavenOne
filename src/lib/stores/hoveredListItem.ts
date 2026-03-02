import { writable } from 'svelte/store';

export const hoveredListItemId = writable<string | null>(null);
export const clickedListItemId = (() => {
    const store = writable<string | null>(null);

    return {
        ...store,
        handleMouseMenuClick(itemId: string) {
            return (ev: Event) => {
                ev.stopPropagation();
                store.update(id => {
                    if (!id) { // setup id
                        return itemId;
                    }
                    else if (id !== itemId) { // setup different item id
                        return itemId;
                    }
                    else return null; // setup null
                });
            }
        }
    }
})();
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
        },
    }
})();