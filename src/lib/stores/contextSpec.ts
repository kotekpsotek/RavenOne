import { browser } from "$app/environment";
import { writable } from "svelte/store";

const CONTEXT_SPEC_STORAGE_KEY = "ravenone:context-spec";

function getInitialContextSpec() {
    if (!browser) {
        return "";
    }

    return localStorage.getItem(CONTEXT_SPEC_STORAGE_KEY) ?? "";
}

export const contextSpecification = writable<string>(getInitialContextSpec());

if (browser) {
    contextSpecification.subscribe((value) => {
        localStorage.setItem(CONTEXT_SPEC_STORAGE_KEY, value);
    });
}

export function saveContextSpecification(value: string) {
    contextSpecification.set(value);
}
