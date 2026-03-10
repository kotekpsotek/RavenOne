import {
    asNonEmptyString,
    createFileCollaboration,
    findFileById,
    loadWorkspaceEntries,
    parseJsonBody,
    persistWorkspaceEntries,
    requireFileEditorCollaborator,
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

    try {
        const editorAccessFailure = await requireFileEditorCollaborator(
            collaboration,
            fileEntry,
            "rename this file"
        );

        if (editorAccessFailure) {
            return editorAccessFailure;
        }
    } finally {
        collaboration.io.disconnect();
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
