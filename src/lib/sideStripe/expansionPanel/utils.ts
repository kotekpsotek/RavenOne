import { selectedFile } from "$lib/stores/files";
import { selectedWorkspace } from "$lib/stores/workspace";
import { setAlert } from "$lib/utils/alert";
import type { File } from "@ravenlens/shared";
import { get } from "svelte/store";

export function findFileById(items: File.File.File[], fileId: string): File.File.File | null {
    for (const item of items) {
        if (item.id === fileId) {
            return item;
        }

        if (item.subentries?.length) {
            const nested = findFileById(item.subentries, fileId);
            if (nested) {
                return nested;
            }
        }
    }

    return null;
}

export function removeFileById(items: File.File.File[], fileId: string): File.File.File[] {
    return items
        .filter((item) => item.id !== fileId)
        .map((item) => {
            if (!item.subentries?.length) {
                return item;
            }

            return {
                ...item,
                subentries: removeFileById(item.subentries, fileId)
            };
        });
}

export function updateFileById(items: File.File.File[], fileId: string, updater: (item: File.File.File) => File.File.File): File.File.File[] {
    return items.map((item) => {
        if (item.id === fileId) {
            const updaterValue = updater(item);

            // Local File updation
            const selectedFileLocal = get(selectedFile);
            if (selectedFileLocal?.id === fileId) {
                selectedFile.set({
                    ...selectedFileLocal,
                    ...updaterValue
                });

                if (updaterValue.name !== selectedFileLocal.name) {
                    document.dispatchEvent(new CustomEvent("file-name-change:leftstripe", {
                        detail: updaterValue.name
                    }));
                }
            }
            
            // Entries updation
            return updaterValue;
        }

        if (item.subentries?.length) {
            return {
                ...item,
                subentries: updateFileById(item.subentries, fileId, updater)
            };
        }

        return item;
    });
}

export function getCurrentWorkspaceId(): string | null {
    const selectedWorkspaceLocal = get(selectedWorkspace);
    const workspaceId = selectedWorkspaceLocal?.id?.trim();

    if (!workspaceId) {
        setAlert("warning", "Workspace not selected", "Select workspace before managing files.");
        return null;
    }

    return workspaceId;
}
