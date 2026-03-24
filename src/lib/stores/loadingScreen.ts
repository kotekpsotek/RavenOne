import { writable } from "svelte/store";

export const loadingState = (() => {
    const { ...all } = writable(false);

    return {
        ...all,
        setLoadingState(state: boolean) {
            all.set(state);
        }
    }
})();
