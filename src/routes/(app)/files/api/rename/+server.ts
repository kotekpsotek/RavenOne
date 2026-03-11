import {
    asNonEmptyString,
    createFileCollaboration,
    findFileById,
    hasUserEditorFileAccess,
    loadWorkspaceEntries,
    parseJsonBody,
    persistWorkspaceEntries,
    requireWorkspaceAccess,
    updateFileById
} from "../server-utils";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type RenameFileRequestBody = {
    workspaceId?: unknown;
    fileId?: unknown;
    name?: unknown;
};

export const PUT: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<RenameFileRequestBody>(request);
    if (!requestBody) {
        return json({ ok: false, message: "Invalid request body" }, { status: 400 });
    }

    const workspaceId = asNonEmptyString(requestBody.workspaceId);
    const fileId = asNonEmptyString(requestBody.fileId);
    const name = asNonEmptyString(requestBody.name);

    if (!workspaceId || !fileId || !name) {
        return json({ ok: false, message: "workspaceId, fileId and name are required" }, { status: 400 });
    }

    const access = await requireWorkspaceAccess({
        request,
        cookies,
        fetchFn: fetch,
        workspaceId,
        requireManageFiles: true
    });

    if (access instanceof Response) {
        return access;
    }

    const workspaceEntries = await loadWorkspaceEntries(workspaceId);
    const fileEntry = findFileById(workspaceEntries, fileId);
    if (!fileEntry) {
        return json({ ok: false, message: "File was not found" }, { status: 404 });
    }

    const collaboration = createFileCollaboration(access);
    if (collaboration instanceof Response) {
        return collaboration;
    }

    const hasNotUserAccessResponse = await hasUserEditorFileAccess({
        request,
        cookies,
        file: fileEntry,
        workspaceId: workspaceId
    });
    if (hasNotUserAccessResponse) {
        return hasNotUserAccessResponse;
    }

    const updateResult = updateFileById(workspaceEntries, fileId, (entry) => {
        return {
            ...entry,
            name
        };
    });

    if (!updateResult.updated) {
        return json({ ok: false, message: "File was not found" }, { status: 404 });
    }

    await persistWorkspaceEntries(workspaceId, updateResult.entries);

    const updatedFile = findFileById(updateResult.entries, fileId);

    return json(
        {
            ok: true,
            updated: true,
            file: updatedFile
        },
        { status: 200 }
    );
};
