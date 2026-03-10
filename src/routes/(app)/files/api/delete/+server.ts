import {
    asNonEmptyString,
    createFileCollaboration,
    findFileById,
    loadWorkspaceEntries,
    parseJsonBody,
    persistWorkspaceEntries,
    removeFileById,
    requireFileEditorCollaborator,
    requireWorkspaceAccess
} from "../server-utils";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type DeleteFileRequestBody = {
    workspaceId?: unknown;
    fileId?: unknown;
};

export const DELETE: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<DeleteFileRequestBody>(request);
    if (!requestBody) {
        return json({ ok: false, message: "Invalid request body" }, { status: 400 });
    }

    const workspaceId = asNonEmptyString(requestBody.workspaceId);
    const fileId = asNonEmptyString(requestBody.fileId);
    if (!workspaceId || !fileId) {
        return json({ ok: false, message: "workspaceId and fileId are required" }, { status: 400 });
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
            "delete this file"
        );

        if (editorAccessFailure) {
            return editorAccessFailure;
        }
    } finally {
        collaboration.io.disconnect();
    }

    const removalResult = removeFileById(workspaceEntries, fileId);
    if (!removalResult.removed) {
        return json({ ok: false, message: "File was not found" }, { status: 404 });
    }

    await persistWorkspaceEntries(workspaceId, removalResult.entries);

    return json(
        {
            ok: true,
            deleted: true,
            fileId
        },
        { status: 200 }
    );
};
