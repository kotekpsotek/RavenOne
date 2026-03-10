import {
    asNullableString,
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

type UpdateWalperRequestBody = {
    workspaceId?: unknown;
    fileId?: unknown;
    walper?: unknown;
};

export const PUT: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<UpdateWalperRequestBody>(request);
    if (!requestBody) {
        return json({ ok: false, message: "Invalid request body" }, { status: 400 });
    }

    const workspaceId = asNonEmptyString(requestBody.workspaceId);
    const fileId = asNonEmptyString(requestBody.fileId);
    const walperCandidate = asNullableString(requestBody.walper);

    if (!workspaceId || !fileId || walperCandidate === undefined) {
        return json({ ok: false, message: "workspaceId, fileId and walper are required" }, { status: 400 });
    }

    const access = await requireWorkspaceAccess({
        request,
        cookies,
        fetchFn: fetch,
        workspaceId,
        requireManageFiles: true,
        requireActiveWorkspaceSubscription: true,
        activeWorkspaceSubscriptionFailureMessage: "Cannot change file wallpaper because this workspace has no active subscription"
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
            "change file wallpaper"
        );

        if (editorAccessFailure) {
            return editorAccessFailure;
        }
    } finally {
        collaboration.io.disconnect();
    }

    const normalizedWalper = walperCandidate?.trim() || undefined;

    const updateResult = updateFileById(workspaceEntries, fileId, (entry) => {
        return {
            ...entry,
            walper: normalizedWalper
        };
    });

    if (!updateResult.updated) {
        return json({ ok: false, message: "File was not found" }, { status: 404 });
    }

    await persistWorkspaceEntries(workspaceId, updateResult.entries);

    return json(
        {
            ok: true,
            updated: true,
            walper: normalizedWalper ?? "",
            file: findFileById(updateResult.entries, fileId)
        },
        { status: 200 }
    );
};
