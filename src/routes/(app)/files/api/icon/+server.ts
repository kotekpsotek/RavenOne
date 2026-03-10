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

type UpdateIconRequestBody = {
    workspaceId?: unknown;
    fileId?: unknown;
    icon?: unknown;
};

export const PUT: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<UpdateIconRequestBody>(request);
    if (!requestBody) {
        return json({ ok: false, message: "Invalid request body" }, { status: 400 });
    }

    const workspaceId = asNonEmptyString(requestBody.workspaceId);
    const fileId = asNonEmptyString(requestBody.fileId);
    const iconCandidate = asNullableString(requestBody.icon);

    if (!workspaceId || !fileId || iconCandidate === undefined) {
        return json({ ok: false, message: "workspaceId, fileId and icon are required" }, { status: 400 });
    }

    const access = await requireWorkspaceAccess({
        request,
        cookies,
        fetchFn: fetch,
        workspaceId,
        requireManageFiles: true,
        requireActiveWorkspaceSubscription: true,
        activeWorkspaceSubscriptionFailureMessage: "Cannot change file icon because this workspace has no active subscription"
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
            "change file icon"
        );

        if (editorAccessFailure) {
            return editorAccessFailure;
        }
    } finally {
        collaboration.io.disconnect();
    }

    const normalizedIcon = iconCandidate?.trim() || undefined;

    const updateResult = updateFileById(workspaceEntries, fileId, (entry) => {
        return {
            ...entry,
            icon: normalizedIcon
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
            icon: normalizedIcon ?? "",
            file: findFileById(updateResult.entries, fileId)
        },
        { status: 200 }
    );
};
