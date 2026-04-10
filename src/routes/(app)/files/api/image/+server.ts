import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { env } from "$env/dynamic/private";
import { getStorageClient } from "$lib/server/gcpStorage";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
    asNonEmptyString,
    findFileById,
    loadWorkspaceEntries,
    parseJsonBody,
    requireWorkspaceAccess
} from "../server-utils";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const IMAGE_PROXY_PATH = "/files/api/image";

const IMAGE_MIME_TO_EXTENSION: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/avif": ".avif"
};

const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".avif": "image/avif"
};

type DeleteImageBody = {
    workspaceId?: unknown;
    fileId?: unknown;
    objectKey?: unknown;
    imageUrl?: unknown;
};

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === "string") {
        return error;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return "Unknown image operation error";
    }
}

function getBucketName(): string {
    const bucketName = env.GCP_STORAGE_BUCKET?.trim();
    if (!bucketName) {
        throw new Error("GCP_STORAGE_BUCKET is not configured");
    }

    return bucketName;
}

function getImageExtension(imageFile: File): string {
    const fromName = imageFile.name.split(".").pop()?.trim().toLowerCase();
    if (fromName && /^[a-z0-9]{1,10}$/.test(fromName)) {
        return `.${fromName}`;
    }

    return IMAGE_MIME_TO_EXTENSION[imageFile.type] ?? ".bin";
}

function ensureImageFile(imageCandidate: FormDataEntryValue | null): File {
    if (!(imageCandidate instanceof File) || imageCandidate.size <= 0) {
        throw new Error("image file is required");
    }

    if (!imageCandidate.type.startsWith("image/")) {
        throw new Error("Only image files are allowed");
    }

    if (imageCandidate.size > MAX_IMAGE_SIZE_BYTES) {
        throw new Error("Image has to be 10MB or smaller");
    }

    return imageCandidate;
}

function buildObjectName(workspaceId: string, fileId: string, imageFile: File): string {
    const extension = getImageExtension(imageFile);
    return `files/${workspaceId}/${fileId}/images/${Date.now()}-${randomUUID()}${extension}`;
}

function buildProtectedImageUrl(workspaceId: string, fileId: string, objectKey: string): string {
    const query = new URLSearchParams({
        workspaceId,
        fileId,
        objectKey
    });

    return `${IMAGE_PROXY_PATH}?${query.toString()}`;
}

function buildObjectPrefix(workspaceId: string, fileId: string): string {
    return `files/${workspaceId}/${fileId}/images/`;
}

function isObjectKeyWithinFileScope(workspaceId: string, fileId: string, objectKey: string): boolean {
    return objectKey.startsWith(buildObjectPrefix(workspaceId, fileId));
}

function inferContentTypeFromObjectKey(objectKey: string): string {
    const extension = objectKey.split(".").pop()?.toLowerCase();
    if (!extension) {
        return "application/octet-stream";
    }

    return IMAGE_EXTENSION_TO_MIME[`.${extension}`] ?? "application/octet-stream";
}

function parseMaybeRelativeUrl(rawUrl: string): URL | null {
    try {
        return new URL(rawUrl);
    } catch {
        try {
            return new URL(rawUrl, "http://localhost");
        } catch {
            return null;
        }
    }
}

function inferObjectKeyFromUrl(imageUrl: string, bucketName: string): string | undefined {
    const parsedUrl = parseMaybeRelativeUrl(imageUrl);
    if (!parsedUrl) {
        return undefined;
    }

    if (parsedUrl.pathname === IMAGE_PROXY_PATH) {
        return asNonEmptyString(parsedUrl.searchParams.get("objectKey"));
    }

    const pathname = parsedUrl.pathname.replace(/^\/+/, "");

    if (parsedUrl.hostname === "storage.googleapis.com") {
        if (!pathname.startsWith(`${bucketName}/`)) {
            return undefined;
        }

        const encodedKey = pathname.slice(bucketName.length + 1);
        return decodeURIComponent(encodedKey);
    }

    const bucketHostName = `${bucketName}.storage.googleapis.com`;
    if (parsedUrl.hostname === bucketHostName) {
        return decodeURIComponent(pathname);
    }

    return undefined;
}

async function ensureFileBelongsToWorkspace(workspaceId: string, fileId: string): Promise<boolean> {
    const workspaceEntries = await loadWorkspaceEntries(workspaceId);
    return Boolean(findFileById(workspaceEntries, fileId));
}

async function uploadImageToStorage(workspaceId: string, fileId: string, imageFile: File): Promise<{ imageUrl: string; objectKey: string }> {
    const bucketName = getBucketName();
    const objectKey = buildObjectName(workspaceId, fileId, imageFile);

    const storage = getStorageClient();
    const bucket = storage.bucket(bucketName);
    const storedFile = bucket.file(objectKey);

    const bytes = Buffer.from(await imageFile.arrayBuffer());

    await storedFile.save(bytes, {
        resumable: false,
        contentType: imageFile.type || "application/octet-stream",
        metadata: {
            cacheControl: "private, max-age=31536000"
        }
    });

    return {
        imageUrl: buildProtectedImageUrl(workspaceId, fileId, objectKey),
        objectKey
    };
}

export const GET: RequestHandler = async ({ url, request, cookies, fetch }) => {
    const workspaceId = asNonEmptyString(url.searchParams.get("workspaceId"));
    const fileId = asNonEmptyString(url.searchParams.get("fileId"));
    const objectKey = asNonEmptyString(url.searchParams.get("objectKey"));

    if (!workspaceId || !fileId || !objectKey) {
        return json(
            { ok: false, message: "workspaceId, fileId and objectKey are required" },
            { status: 400 }
        );
    }

    const access = await requireWorkspaceAccess({
        request,
        cookies,
        fetchFn: fetch,
        workspaceId
    });

    if (access instanceof Response) {
        return access;
    }

    if (!isObjectKeyWithinFileScope(workspaceId, fileId, objectKey)) {
        return json({ ok: false, message: "Image is outside the requested file scope" }, { status: 403 });
    }

    try {
        const fileExists = await ensureFileBelongsToWorkspace(workspaceId, fileId);
        if (!fileExists) {
            return json({ ok: false, message: "File was not found" }, { status: 404 });
        }

        const storage = getStorageClient();
        const storedFile = storage.bucket(getBucketName()).file(objectKey);
        const [exists] = await storedFile.exists();

        if (!exists) {
            return json({ ok: false, message: "Image not found" }, { status: 404 });
        }

        const [bytes] = await storedFile.download();
        const [metadata] = await storedFile.getMetadata().catch(() => [undefined] as const);
        const contentType = typeof metadata?.contentType === "string" && metadata.contentType.trim().length
            ? metadata.contentType
            : inferContentTypeFromObjectKey(objectKey);

        const responseHeaders = new Headers({
            "Content-Type": contentType,
            "Content-Length": String(bytes.byteLength),
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff"
        });

        if (typeof metadata?.etag === "string" && metadata.etag.trim().length) {
            responseHeaders.set("ETag", metadata.etag);
        }

        return new Response(new Uint8Array(bytes), {
            status: 200,
            headers: responseHeaders
        });
    } catch (error) {
        return json({ ok: false, message: toErrorMessage(error) }, { status: 500 });
    }
};

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
    let formData: FormData;

    try {
        formData = await request.formData();
    } catch {
        return json({ ok: false, message: "Invalid request body" }, { status: 400 });
    }

    const workspaceId = asNonEmptyString(formData.get("workspaceId"));
    const fileId = asNonEmptyString(formData.get("fileId"));

    if (!workspaceId || !fileId) {
        return json({ ok: false, message: "workspaceId and fileId are required" }, { status: 400 });
    }

    let imageFile: File;
    try {
        imageFile = ensureImageFile(formData.get("image"));
    } catch (error) {
        return json({ ok: false, message: toErrorMessage(error) }, { status: 400 });
    }

    const access = await requireWorkspaceAccess({
        request,
        cookies,
        fetchFn: fetch,
        workspaceId,
        requireActiveWorkspaceSubscription: true,
        activeWorkspaceSubscriptionFailureMessage: "Cannot upload image because this workspace has no active subscription"
    });

    if (access instanceof Response) {
        return access;
    }

    try {
        const fileExists = await ensureFileBelongsToWorkspace(workspaceId, fileId);
        if (!fileExists) {
            return json({ ok: false, message: "File was not found" }, { status: 404 });
        }

        const uploaded = await uploadImageToStorage(workspaceId, fileId, imageFile);

        return json(
            {
                ok: true,
                imageUrl: uploaded.imageUrl,
                objectKey: uploaded.objectKey
            },
            { status: 201 }
        );
    } catch (error) {
        return json({ ok: false, message: toErrorMessage(error) }, { status: 500 });
    }
};

export const DELETE: RequestHandler = async ({ request, cookies, fetch }) => {
    const requestBody = await parseJsonBody<DeleteImageBody>(request);
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
        requireActiveWorkspaceSubscription: true,
        activeWorkspaceSubscriptionFailureMessage: "Cannot delete image because this workspace has no active subscription"
    });

    if (access instanceof Response) {
        return access;
    }

    try {
        const fileExists = await ensureFileBelongsToWorkspace(workspaceId, fileId);
        if (!fileExists) {
            return json({ ok: false, message: "File was not found" }, { status: 404 });
        }

        const bucketName = getBucketName();
        const explicitObjectKey = asNonEmptyString(requestBody.objectKey);
        const imageUrl = asNonEmptyString(requestBody.imageUrl);
        const inferredObjectKey = imageUrl ? inferObjectKeyFromUrl(imageUrl, bucketName) : undefined;
        const objectKey = explicitObjectKey ?? inferredObjectKey;

        if (!objectKey) {
            return json({ ok: false, message: "objectKey or known imageUrl is required" }, { status: 400 });
        }

        if (!isObjectKeyWithinFileScope(workspaceId, fileId, objectKey)) {
            return json({ ok: false, message: "Image is outside the requested file scope" }, { status: 403 });
        }

        const storage = getStorageClient();
        await storage.bucket(bucketName).file(objectKey).delete({ ignoreNotFound: true });

        return json(
            {
                ok: true,
                deleted: true,
                objectKey
            },
            { status: 200 }
        );
    } catch (error) {
        return json({ ok: false, message: toErrorMessage(error) }, { status: 500 });
    }
};
