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
import { File } from "@ravenlens/shared";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type SaveContentRequestBody = {
    workspaceId?: unknown;
    file?: unknown;
};

type IncomingFilePayload = {
    id?: unknown;
    content?: unknown;
    lists?: unknown;
};

type FileUpdate = {
    fileId: string;
    content: string;
    lists: File.File.SpawnedList[];
};

const EMPTY_FILE_CONTENT = "<p></p>";

function normalizeLists(listsCandidate: unknown): File.File.SpawnedList[] {
    if (!Array.isArray(listsCandidate)) {
        return [];
    }

    return listsCandidate as File.File.SpawnedList[];
}

function normalizeFileContent(contentCandidate: unknown): string {
    if (typeof contentCandidate !== "string") {
        return EMPTY_FILE_CONTENT;
    }

    if (!contentCandidate.trim()) {
        return EMPTY_FILE_CONTENT;
    }

    return contentCandidate;
}

function buildFileUpdate(fileCandidate: unknown): FileUpdate | null {
    if (!fileCandidate || typeof fileCandidate !== "object") {
        return null;
    }

    const filePayload = fileCandidate as IncomingFilePayload;

    const fileId = asNonEmptyString(filePayload.id);
    if (!fileId) {
        return null;
    }

    return {
        fileId,
        content: normalizeFileContent(filePayload.content),
        lists: normalizeLists(filePayload.lists)
    };
}

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<SaveContentRequestBody>(request);
    if (!requestBody) {
        return json({ ok: false, message: "Invalid request body" }, { status: 400 });
    }

    const workspaceId = asNonEmptyString(requestBody.workspaceId);
    if (!workspaceId) {
        return json({ ok: false, message: "workspaceId is required" }, { status: 400 });
    }

    const fileUpdate = buildFileUpdate(requestBody.file);
    if (!fileUpdate) {
        return json({ ok: false, message: "file has to be a valid file object" }, { status: 400 });
    }

    const access = await requireWorkspaceAccess({
        request,
        cookies,
        fetchFn: fetch,
        workspaceId,
        requireActiveWorkspaceSubscription: true,
        activeWorkspaceSubscriptionFailureMessage: "Cannot change file content because this workspace has no active subscription"
    });

    if (access instanceof Response) {
        return access;
    }

    try {
        const workspaceEntries = await loadWorkspaceEntries(workspaceId);
        const fileEntry = findFileById(workspaceEntries, fileUpdate.fileId);
        if (!fileEntry) {
            return json({ ok: false, message: "File was not found" }, { status: 404 });
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

        const updateResult = updateFileById(workspaceEntries, fileUpdate.fileId, (entry) => {
            return {
                ...entry,
                content: fileUpdate.content,
                lists: fileUpdate.lists
            };
        });

        if (!updateResult.updated) {
            return json({ ok: false, message: "File was not found" }, { status: 404 });
        }

        await persistWorkspaceEntries(workspaceId, updateResult.entries);

        return json({ ok: true, fileId: fileUpdate.fileId }, { status: 200 });
    } catch (error) {
        console.error("Cannot persist file content", error);
        return json({ ok: false, message: "Cannot save file content" }, { status: 500 });
    }
};
