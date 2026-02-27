import { writable } from "svelte/store";

export interface Alert {
    name: string;
    description?: string;
    icon?: string;
    type?: "success" | "warning" | "info" | "error";
    classStyle?: string;
    btns?: { name: string, classStyle: string, onClick: () => void }[]
}

export const alertState = writable<{ alert: Alert, timeoutMs: number } | undefined>(undefined);
