import { selectedWorkspace } from "$lib/stores/workspace";
import { fetchAuthenticated } from "@ravenlens/frontend/utils/fetch";
import { File } from "@ravenlens/shared";
import { get } from "svelte/store";
export * from "@ravenlens/frontend/utils/fetch";

export async function fetchTheFreshestFile(file: File.File.File) {
    try {
        const response = await fetchAuthenticated("/api/download/file", {
            method: "POST",
            headers: {
                'Content-Type': "application/json"
            },
            body: JSON.stringify({
                workspaceId: get(selectedWorkspace)?.id,
                fileId: file.id
            })
        });
    
        if (response.ok) {
            const { ok, file } = await response.json() as {
                ok: boolean;
                file: File.File.File;
            };
    
            if (ok) {
                return file;
            }
        }
    }
    catch(err) {
        console.error('Cannot fetch the freshest file', err);
    }

    return false;
}
