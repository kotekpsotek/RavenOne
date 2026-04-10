import {
    asNonEmptyString,
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
    files?: unknown;
};

type SaveFileEnvelope = {
    file?: unknown;
    date?: unknown;
};

type IncomingFilePayload = {
    id?: unknown;
    content?: unknown;
    lists?: unknown;
    routines?: unknown;
    spikes?: unknown;
};

type FileUpdate = {
    fileId: string;
    date: number;
    content: string;
    lists: File.File.SpawnedList;
    routines: File.File.SpawnedList;
    spikes: File.File.SpawnedList;
};

const EMPTY_FILE_CONTENT = "<p></p>";

function normalizeDate(dateCandidate: unknown): number {
    if (typeof dateCandidate === "number" && Number.isFinite(dateCandidate)) {
        return dateCandidate;
    }

    return Date.now();
}

function normalizeSpawnedList(spawnedListCandidate: unknown): File.File.SpawnedList {
    const defaultReturnValue: File.File.SpawnedList = {
        list: [],
        config: {
            model: {
                id: "",
                name: "",
                provider: {
                    provider: ""
                },
                weight: 0
            },
            context: {
                desktopFiles: [],
                editorFiles: [],
                networkUrls: []
            }
        }
    };

    if (Array.isArray(spawnedListCandidate)) {
        return {
            ...defaultReturnValue,
            list: spawnedListCandidate as File.File.SpawnedList["list"]
        };
    }

    if (!spawnedListCandidate || typeof spawnedListCandidate !== "object") {
        return defaultReturnValue;
    }

    const spawnedList = spawnedListCandidate as Partial<File.File.SpawnedList>;
    const config = (spawnedList.config ?? {}) as Partial<File.File.SpawnedList["config"]>;

    return {
        list: Array.isArray(spawnedList.list) ? spawnedList.list : [],
        config: {
            model: {
                ...defaultReturnValue.config.model,
                ...(config.model ?? {})
            },
            context: {
                desktopFiles: [...(config.context?.desktopFiles ?? [])],
                editorFiles: [...(config.context?.editorFiles ?? [])],
                networkUrls: [...(config.context?.networkUrls ?? [])]
            }
        }
    };
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
        if (!fileId) {
            return null;
        }

        updates.push({
            fileId,
            date: normalizeDate(envelope.date),
            content: normalizeFileContent(filePayload.content),
            lists: normalizeSpawnedList(filePayload.lists),
            routines: normalizeSpawnedList(filePayload.routines),
            spikes: normalizeSpawnedList(filePayload.spikes)
        });
    }

    return updates;
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

    const incomingUpdates = buildFileUpdates(requestBody.files);
    if (!incomingUpdates) {
        return json({ ok: false, message: "files has to be an array of unsaved file entries" }, { status: 400 });
    }

    if (!incomingUpdates.length) {
        return json([], { status: 200 });
    }

    // Keep only the newest item for each file key.
    const dedupedUpdates = new Map<string, FileUpdate>();
    for (const update of incomingUpdates) {
        const dedupeKey = update.fileId;
        const existingUpdate = dedupedUpdates.get(dedupeKey);

        if (!existingUpdate || existingUpdate.date < update.date) {
            dedupedUpdates.set(dedupeKey, update);
        }
    }

    const updates = [...dedupedUpdates.values()];

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
        let workspaceEntries = await loadWorkspaceEntries(workspaceId);
        const acknowledgedFileIds: string[] = [];
        let hasPersistedChanges = false;

        for (const update of updates) {
            const updateResult = updateFileById(workspaceEntries, update.fileId, (entry) => {
                return {
                    ...entry,
                    content: update.content,
                    lists: update.lists,
                    routines: update.routines,
                    spikes: update.spikes
                };
            });

            // File may already be removed by delete operation; acknowledge to avoid stuck retries.
            if (!updateResult.updated) {
                acknowledgedFileIds.push(update.fileId);
                continue;
            }

            hasPersistedChanges = true;
            workspaceEntries = updateResult.entries;
            acknowledgedFileIds.push(update.fileId);
        }

        if (hasPersistedChanges) {
            await persistWorkspaceEntries(workspaceId, workspaceEntries);
        }

        return json(acknowledgedFileIds, { status: 200 });
    } catch (error) {
        console.error("Cannot persist file content", error);
        return json({ ok: false, message: "Cannot save file content" }, { status: 500 });
    }
};
