import {
    addFileToTarget,
    asNullableString,
    asNonEmptyString,
    createFileEntry,
    loadWorkspaceEntries,
    parseJsonBody,
    persistWorkspaceEntries,
    requireWorkspaceAccess
} from "../server-utils";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type CreateFileRequestBody = {
    workspaceId?: unknown;
    targetId?: unknown;
    name?: unknown;
};

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<CreateFileRequestBody>(request);
    if (!requestBody) {
        return json({ ok: false, message: "Invalid request body" }, { status: 400 });
    }

    const workspaceId = asNonEmptyString(requestBody.workspaceId);
    if (!workspaceId) {
        return json({ ok: false, message: "workspaceId is required" }, { status: 400 });
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

    const targetIdCandidate = requestBody.targetId === undefined
        ? null
        : asNullableString(requestBody.targetId);
    if (targetIdCandidate === undefined) {
        return json({ ok: false, message: "targetId has to be a string or null" }, { status: 400 });
    }

    const normalizedName = asNonEmptyString(requestBody.name) ?? "Unnamed Task";
    const newFile = createFileEntry(normalizedName, workspaceId);

    const workspaceEntries = await loadWorkspaceEntries(workspaceId);

    let nextEntries = workspaceEntries;
    if (targetIdCandidate === null) {
        nextEntries = [...workspaceEntries, newFile];
    } else {
        const insertionResult = addFileToTarget(workspaceEntries, targetIdCandidate, newFile);
        if (!insertionResult.inserted) {
            return json({ ok: false, message: "Target file was not found" }, { status: 404 });
        }

        nextEntries = insertionResult.entries;
    }

    await persistWorkspaceEntries(workspaceId, nextEntries);

    return json(
        {
            ok: true,
            createdFile: newFile,
            targetId: targetIdCandidate
        },
        { status: 200 }
    );
};
