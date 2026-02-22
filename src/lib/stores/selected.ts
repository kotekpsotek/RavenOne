import type { DefaultModel } from "$lib/config/models";
import { writable } from "svelte/store";

export const selectedModel = writable<DefaultModel | undefined>(undefined);
