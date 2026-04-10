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

type ConfirmationOptions = {
    name: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
    cancelLabel?: string;
    onCancel?: () => void;
};

export function setAlert(type: "success" | "error" | "warning", name: string, description: string) {
    alertState.set({
        alert: {
            type,
            name,
            description
        },
        timeoutMs: 5_000
    });
}

export function setConfirmationAlert({
    name,
    description,
    confirmLabel,
    onConfirm,
    cancelLabel = "Cancel",
    onCancel = () => undefined
}: ConfirmationOptions) {
    alertState.set({
        alert: {
            type: "warning",
            name,
            description,
            btns: [
                {
                    name: cancelLabel,
                    classStyle: "btn-ghost",
                    onClick: onCancel
                },
                {
                    name: confirmLabel,
                    classStyle: "btn-error",
                    onClick: onConfirm
                }
            ]
        },
        timeoutMs: 0
    });
}
