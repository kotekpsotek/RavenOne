import { readFailureMessage } from "$lib/files/utils";
import { selectedFile } from "$lib/stores/files";
import { selectedWorkspace } from "$lib/stores/workspace";
import { fetchAuthenticated } from "$lib/utils/fetch";
import { get } from "svelte/store";

const IMAGE_API_PATH = "/files/api/image";

type UploadImageResponse = {
    ok?: boolean;
    imageUrl?: string;
    objectKey?: string;
    message?: string;
    error?: string;
};

type DeleteImageResponse = {
    ok?: boolean;
    deleted?: boolean;
    message?: string;
    error?: string;
};

export type UploadedEditorImage = {
    imageUrl: string;
    objectKey: string;
    width: number;
    height: number;
};

export type DeleteEditorImageInput = {
    objectKey?: string;
    imageUrl?: string;
};

function asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
}

function getImageUploadContext(): { workspaceId: string; fileId: string } {
    const workspaceId = asNonEmptyString(get(selectedWorkspace)?.id);
    const fileId = asNonEmptyString(get(selectedFile)?.id);

    if (!workspaceId || !fileId) {
        throw new Error("Select a file in a workspace before adding images");
    }

    return {
        workspaceId,
        fileId
    };
}

export async function readImageDimensionsFromFile(file: File): Promise<{ width: number; height: number }> {
    const localUrl = URL.createObjectURL(file);

    try {
        const loadedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();

            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Cannot read image dimensions"));
            image.src = localUrl;
        });

        return {
            width: Math.max(1, Math.round(loadedImage.naturalWidth || loadedImage.width || 0)),
            height: Math.max(1, Math.round(loadedImage.naturalHeight || loadedImage.height || 0))
        };
    } finally {
        URL.revokeObjectURL(localUrl);
    }
}

export async function uploadEditorImage(file: File): Promise<UploadedEditorImage> {
    const { workspaceId, fileId } = getImageUploadContext();

    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("fileId", fileId);
    formData.set("image", file);

    let response: Response;
    try {
        response = await fetchAuthenticated(IMAGE_API_PATH, {
            method: "POST",
            body: formData
        });
    } catch {
        throw new Error("Cannot reach image upload service");
    }

    if (!response.ok) {
        throw new Error(await readFailureMessage(response, "Cannot upload image"));
    }

    let body: UploadImageResponse;
    try {
        body = (await response.json()) as UploadImageResponse;
    } catch {
        throw new Error("Image upload service returned invalid response");
    }

    const imageUrl = asNonEmptyString(body.imageUrl);
    const objectKey = asNonEmptyString(body.objectKey);

    if (!imageUrl || !objectKey) {
        throw new Error("Image upload service returned invalid image payload");
    }

    const dimensions = await readImageDimensionsFromFile(file).catch(() => ({ width: 0, height: 0 }));

    return {
        imageUrl,
        objectKey,
        width: dimensions.width,
        height: dimensions.height
    };
}

export async function deleteEditorImage(input: DeleteEditorImageInput): Promise<boolean> {
    const objectKey = asNonEmptyString(input.objectKey);
    const imageUrl = asNonEmptyString(input.imageUrl);

    if (!objectKey && !imageUrl) {
        return true;
    }

    const { workspaceId, fileId } = getImageUploadContext();

    let response: Response;
    try {
        response = await fetchAuthenticated(IMAGE_API_PATH, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                workspaceId,
                fileId,
                ...(objectKey ? { objectKey } : {}),
                ...(imageUrl ? { imageUrl } : {})
            })
        });
    } catch {
        throw new Error("Cannot reach image delete service");
    }

    if (!response.ok) {
        throw new Error(await readFailureMessage(response, "Cannot delete image"));
    }

    let body: DeleteImageResponse;
    try {
        body = (await response.json()) as DeleteImageResponse;
    } catch {
        return true;
    }

    return body.deleted ?? true;
}
