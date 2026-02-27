import { writable } from "svelte/store";

export type Themes = "dark" | "light";
export const theme = writable<Themes>("dark");
