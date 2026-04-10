import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { env } from "$env/dynamic/private";
import { getStorageClient } from "$lib/server/gcpStorage";
import {
    asNonEmptyString,
    loadWorkspaceEntries,
    parseJsonBody,
    persistWorkspaceEntries,
    requireWorkspaceAccess,
    updateFileById
} from "../../server-utils";
import { File } from "@ravenlens/shared";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type SaveContextRequestBody = {
    workspaceId?: unknown;
    fileId?: unknown;
    tab?: unknown;
    context?: unknown;
};

type TabsAvailable = "Tasks" | "Routines" | "Spikes";
type ConfigTarget = keyof Pick<File.File.File, "lists" | "routines" | "spikes">;
type ContextDesktopFileInput = File.FileAI.ContextDeviceFile | File.FileAI.ContextDeviceFileDB;

const MAX_CONTEXT_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function getConfigTargetByTab(tab: TabsAvailable): ConfigTarget {
    if (tab === "Routines") {
        return "routines";
    }

    if (tab === "Spikes") {
        return "spikes";
    }

    return "lists";
}

function asTab(value: unknown): TabsAvailable | undefined {
    if (value === "Tasks" || value === "Routines" || value === "Spikes") {
        return value;
    }

    return undefined;
}

function createDefaultSpawnedListConfig(): File.File.SpawnedList {
    return {
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
}

function normalizeSpawnedList(value: unknown): File.File.SpawnedList {
    if (!value || typeof value !== "object") {
        return createDefaultSpawnedListConfig();
    }

    const spawnedList = value as Partial<File.File.SpawnedList>;
    const config = (spawnedList.config ?? {}) as Partial<File.File.SpawnedList["config"]>;

    return {
        list: Array.isArray(spawnedList.list) ? spawnedList.list : [],
        config: {
            model: {
                ...createDefaultSpawnedListConfig().config.model,
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

function decodeDataUrl(raw: string): { bytes: Buffer; contentType: string } {
    const value = raw.trim();

    const dataUrlMatch = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i.exec(value);
    if (!dataUrlMatch) {
        return {
            bytes: Buffer.from(value),
            contentType: "application/octet-stream"
        };
    }

    const contentType = dataUrlMatch[1]?.trim() || "application/octet-stream";
    const payload = dataUrlMatch[3] ?? "";

    if (dataUrlMatch[2]) {
        return {
            bytes: Buffer.from(payload, "base64"),
            contentType
        };
    }

    return {
        bytes: Buffer.from(decodeURIComponent(payload)),
        contentType
    };
}

function getFileExtension(fileName: string, mimeType: string): string {
    const extensionFromName = fileName.split(".").pop()?.trim().toLowerCase();
    if (extensionFromName && /^[a-z0-9]{1,10}$/.test(extensionFromName)) {
        return `.${extensionFromName}`;
    }

    const mimeToExtension: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/svg+xml": ".svg",
        "application/pdf": ".pdf",
        "text/plain": ".txt"
    };

    return mimeToExtension[mimeType] ?? ".bin";
}

function sanitizeObjectSegment(segment: string): string {
    const normalized = segment.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
    return normalized || "file";
}

async function uploadContextDesktopFileToGoogleStorage(args: {
    workspaceId: string;
    fileId: string;
    tab: TabsAvailable;
    desktopFile: { name: string; type: string; content: string };
}): Promise<string> {
    const bucketName = env.GCP_STORAGE_BUCKET?.trim();
    if (!bucketName) {
        throw new Error("GCP_STORAGE_BUCKET is not configured");
    }

    const decoded = decodeDataUrl(args.desktopFile.content);
    if (decoded.bytes.length > MAX_CONTEXT_FILE_SIZE_BYTES) {
        throw new Error("Context desktop file has to be 25MB or smaller");
    }

    const effectiveMimeType = args.desktopFile.type || decoded.contentType || "application/octet-stream";
    const extension = getFileExtension(args.desktopFile.name, effectiveMimeType);
    const objectName = [
        "files-context",
        args.workspaceId,
        args.fileId,
        args.tab.toLowerCase(),
        `${Date.now()}-${randomUUID()}-${sanitizeObjectSegment(args.desktopFile.name)}${extension}`
    ].join("/");

    const objectPath = objectName
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

    const storage = getStorageClient();
    const bucket = storage.bucket(bucketName);
    const uploadedFile = bucket.file(objectName);

    await uploadedFile.save(decoded.bytes, {
        resumable: false,
        contentType: effectiveMimeType,
        metadata: {
            cacheControl: "public, max-age=31536000"
        }
    });

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${objectPath}`;

    try {
        await uploadedFile.makePublic();
        return publicUrl;
    } catch {
        const [signedUrl] = await uploadedFile.getSignedUrl({
            action: "read",
            expires: Date.now() + 1000 * 60 * 60 * 24 * 365
        });

        return signedUrl;
    }
}

function normalizeEditorFiles(value: unknown): File.FileAI.ContextEditorFile[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => {
            if (!entry || typeof entry !== "object") {
                return undefined;
            }

            const candidate = entry as { id?: unknown; name?: unknown };
            const id = asNonEmptyString(candidate.id);
            const name = asNonEmptyString(candidate.name);

            if (!id || !name) {
                return undefined;
            }

            return {
                id,
                name
            } satisfies File.FileAI.ContextEditorFile;
        })
        .filter((entry): entry is File.FileAI.ContextEditorFile => Boolean(entry));
}

function normalizeNetworkUrls(value: unknown): File.FileAI.ContextNetworkURL[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => {
            if (!entry || typeof entry !== "object") {
                return undefined;
            }

            const candidate = entry as { id?: unknown; url?: unknown; favicon?: unknown };
            const id = asNonEmptyString(candidate.id);
            const url = asNonEmptyString(candidate.url);
            const favicon = asNonEmptyString(candidate.favicon);

            if (!id || !url || !favicon) {
                return undefined;
            }

            return {
                id,
                url,
                favicon
            } satisfies File.FileAI.ContextNetworkURL;
        })
        .filter((entry): entry is File.FileAI.ContextNetworkURL => Boolean(entry));
}

async function normalizeDesktopFiles(
    value: unknown,
    args: { workspaceId: string; fileId: string; tab: TabsAvailable }
): Promise<File.FileAI.ContextDeviceFileDB[]> {
    if (!Array.isArray(value)) {
        return [];
    }

    const normalized = await Promise.all(value.map(async (entry) => {
        if (!entry || typeof entry !== "object") {
            return undefined;
        }

        const candidate = entry as ContextDesktopFileInput;
        const id = asNonEmptyString(candidate.id);
        const name = asNonEmptyString(candidate.name);

        if (!id || !name) {
            return undefined;
        }

        const type = asNonEmptyString(candidate.type) ?? "application/octet-stream";
        const size = typeof candidate.size === "number" && Number.isFinite(candidate.size) && candidate.size >= 0
            ? candidate.size
            : 0;
        const locationHint = asNonEmptyString(candidate.locationHint) ?? "Desktop";

        const rawContent = asNonEmptyString((candidate as File.FileAI.ContextDeviceFile).content);
        const existingContentUrl = asNonEmptyString((candidate as File.FileAI.ContextDeviceFileDB).contentURL);

        let contentURL = existingContentUrl;
        if (rawContent) {
            contentURL = await uploadContextDesktopFileToGoogleStorage({
                workspaceId: args.workspaceId,
                fileId: args.fileId,
                tab: args.tab,
                desktopFile: {
                    name,
                    type,
                    content: rawContent
                }
            });
        }

        if (!contentURL) {
            return undefined;
        }

        return {
            id,
            name,
            type,
            size,
            locationHint,
            contentURL
        } satisfies File.FileAI.ContextDeviceFileDB;
    }));

    const dedupedById = new Map<string, File.FileAI.ContextDeviceFileDB>();
    for (const file of normalized) {
        if (!file) {
            continue;
        }

        dedupedById.set(file.id, file);
    }

    return [...dedupedById.values()];
}

async function normalizeContextPayload(
    value: unknown,
    args: { workspaceId: string; fileId: string; tab: TabsAvailable }
): Promise<File.FileAI.ContextSpecificationPayload | undefined> {
    if (!value || typeof value !== "object") {
        return undefined;
    }

    const candidate = value as {
        desktopFiles?: unknown;
        editorFiles?: unknown;
        networkUrls?: unknown;
    };

    const desktopFiles = await normalizeDesktopFiles(candidate.desktopFiles, args);
    const editorFiles = normalizeEditorFiles(candidate.editorFiles);
    const networkUrls = normalizeNetworkUrls(candidate.networkUrls);

    return {
        desktopFiles,
        editorFiles,
        networkUrls
    };
}

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<SaveContextRequestBody>(request);
    if (!requestBody) {
        return json({ ok: false, message: "Invalid request body" }, { status: 400 });
    }

    const workspaceId = asNonEmptyString(requestBody.workspaceId);
    const fileId = asNonEmptyString(requestBody.fileId);
    const tab = asTab(requestBody.tab);

    if (!workspaceId || !fileId || !tab) {
        return json(
            { ok: false, message: "workspaceId, fileId and tab are required" },
            { status: 400 }
        );
    }

    const context = await normalizeContextPayload(requestBody.context, {
        workspaceId,
        fileId,
        tab
    });

    if (!context) {
        return json({ ok: false, message: "context is required" }, { status: 400 });
    }

    const access = await requireWorkspaceAccess({
        request,
        cookies,
        fetchFn: fetch,
        workspaceId,
        requireActiveWorkspaceSubscription: true,
        activeWorkspaceSubscriptionFailureMessage: "Cannot update context because this workspace has no active subscription"
    });

    if (access instanceof Response) {
        return access;
    }

    try {
        const workspaceEntries = await loadWorkspaceEntries(workspaceId);
        const target = getConfigTargetByTab(tab);

        const updateResult = updateFileById(workspaceEntries, fileId, (entry) => {
            const targetData = normalizeSpawnedList(entry[target]);

            return {
                ...entry,
                [target]: {
                    ...targetData,
                    config: {
                        ...targetData.config,
                        context
                    }
                }
            };
        });

        if (!updateResult.updated) {
            return json({ ok: false, message: "File not found" }, { status: 404 });
        }

        await persistWorkspaceEntries(workspaceId, updateResult.entries);

        return json(
            {
                ok: true,
                fileId,
                tab,
                context
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("Cannot persist selected tab context", error);
        return json({ ok: false, message: "Cannot persist selected tab context" }, { status: 500 });
    }
};
