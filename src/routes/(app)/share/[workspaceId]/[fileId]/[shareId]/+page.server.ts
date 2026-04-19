import type { File, Workspace } from "$lib/sharedCompat";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

type WorkspaceUserEntryLoaded = Workspace.Workspace.WorkspaceUserEntryLoaded;

type SharedFileApiResponse = {
    ok?: boolean;
    message?: string;
    file?: File.File.File;
    workspace?: WorkspaceUserEntryLoaded;
};

export const load: PageServerLoad = async ({ fetch, params }) => {
    const searchParams = new URLSearchParams({
        workspaceId: params.workspaceId,
        fileId: params.fileId,
        shareId: params.shareId
    });

    const response = await fetch(`/files/api/share?${searchParams.toString()}`);

    let responseBody: SharedFileApiResponse | null = null;
    try {
        responseBody = (await response.json()) as SharedFileApiResponse;
    } catch {
        responseBody = null;
    }

    if (!response.ok) {
        throw error(response.status, responseBody?.message ?? "Cannot load shared file");
    }

    if (!responseBody?.file || !responseBody.workspace) {
        throw error(404, "Shared file was not found");
    }

    return {
        file: responseBody.file,
        workspace: responseBody.workspace
    };
};
