import { browser } from "$app/environment";
import type { ContextSpecificationPayload } from "$lib/editorComponents/types/AIList";
import { get, writable } from "svelte/store";

const CONTEXT_SPEC_STORAGE_KEY = "ravenone:context-spec";

function getInitialContextSpec(): ContextSpecificationPayload {
    const defaultReturnValue = {
        desktopFiles: [],
        editorFiles: [],
        networkUrls: []
    }

    if (!browser) {
        return defaultReturnValue;
    }

    const item = localStorage.getItem(CONTEXT_SPEC_STORAGE_KEY) ?? "";

    try {
        return JSON.parse(item) as ContextSpecificationPayload;
    }
    catch(err) {
        console.error(err);
        return defaultReturnValue;
    }
}

export const contextSpecification = (() => {
    const { ...all } = writable<ContextSpecificationPayload>(getInitialContextSpec());

    const toJSONString = (value?: ContextSpecificationPayload) => {
        const state = value ?? get(all);
        return JSON.stringify(state);
    }

    if (browser) {
        all.subscribe((value) => {
            localStorage.setItem(CONTEXT_SPEC_STORAGE_KEY, toJSONString(value));
        });
    };

    return {
        ...all,
        toJSONString
    }
})();

