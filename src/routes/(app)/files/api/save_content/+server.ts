import { asNonEmptyString, parseJsonBody, requireWorkspaceAccess } from "../server-utils";
import { DB_Models } from "@ravenlens/backend";
import { File } from "@ravenlens/shared";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type SaveContentRequestBody = {
    files?: unknown;
};

type SaveFileEnvelope = {
    file?: unknown;
    date?: unknown;
};

type IncomingFilePayload = {
    id?: unknown;
    createdByAuthorId?: unknown;
    content?: unknown;
    lists?: unknown;
};

type FileUpdate = {
    fileId: string;
    workspaceId: string;
    date: number;
    content: string;
    lists: File.File.SpawnedList[];
};

function normalizeDate(dateCandidate: unknown): number {
    if (typeof dateCandidate === "number" && Number.isFinite(dateCandidate)) {
        return dateCandidate;
    }

    return Date.now();
}

function normalizeLists(listsCandidate: unknown): File.File.SpawnedList[] {
    if (!Array.isArray(listsCandidate)) {
        return [];
    }

    return listsCandidate as File.File.SpawnedList[];
}

function buildFileUpdates(filesCandidate: unknown): FileUpdate[] | null {
    if (!Array.isArray(filesCandidate)) {
        return null;
    }

    const updates: FileUpdate[] = [];

    for (const envelopeCandidate of filesCandidate) {
        if (!envelopeCandidate || typeof envelopeCandidate !== "object") {
            return null;
        }

        const envelope = envelopeCandidate as SaveFileEnvelope;
        if (!envelope.file || typeof envelope.file !== "object") {
            return null;
        }

        const filePayload = envelope.file as IncomingFilePayload;

        const fileId = asNonEmptyString(filePayload.id);
        const workspaceId = asNonEmptyString(filePayload.createdByAuthorId);

        if (!fileId || !workspaceId) {
            return null;
        }

        updates.push({
            fileId,
            workspaceId,
            date: normalizeDate(envelope.date),
            content: typeof filePayload.content === "string" ? filePayload.content : "",
            lists: normalizeLists(filePayload.lists)
        });
    }

    return updates;
}

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<SaveContentRequestBody>(request);
    if (!requestBody) {
        return json({ ok: false, message: "Invalid request body" }, { status: 400 });
    }

    const incomingUpdates = buildFileUpdates(requestBody.files);
    if (!incomingUpdates) {
        return json({ ok: false, message: "files has to be an array of unsaved file entries" }, { status: 400 });
    }

    if (!incomingUpdates.length) {
        return json([], { status: 200 });
    }

    // Keep only the newest item for each workspace/file key.
    const dedupedUpdates = new Map<string, FileUpdate>();
    for (const update of incomingUpdates) {
        const dedupeKey = `${update.workspaceId}:${update.fileId}`;
        const existingUpdate = dedupedUpdates.get(dedupeKey);

        if (!existingUpdate || existingUpdate.date < update.date) {
            dedupedUpdates.set(dedupeKey, update);
        }
    }

    const updates = [...dedupedUpdates.values()];
    const workspaceIds = [...new Set(updates.map((update) => update.workspaceId))];

    for (const workspaceId of workspaceIds) {
        const access = await requireWorkspaceAccess({
            request,
            cookies,
            fetchFn: fetch,
            workspaceId
        });

        if (access instanceof Response) {
            return access;
        }
    }

    try {
        const saveResults = await Promise.all(
            updates.map(async (update) => {
                const result = await DB_Models.File.fileModel.updateOne(
                    {
                        id: update.fileId,
                        createdByAuthorId: update.workspaceId
                    },
                    {
                        $set: {
                            content: update.content,
                            lists: update.lists
                        }
                    }
                );

                return result.matchedCount > 0 ? update.fileId : null;
            })
        );

        const savedFileIds = saveResults.filter((value): value is string => Boolean(value));

        return json(savedFileIds, { status: 200 });
    } catch (error) {
        console.error("Cannot persist file content", error);
        return json({ ok: false, message: "Cannot save file content" }, { status: 500 });
    }
};
