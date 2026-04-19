import type { File } from "$lib/sharedCompat"

export type DropPosition = 'before' | 'after' | 'inside' | null;
export type FilesApiRequestMethod = "POST" | "PUT" | "DELETE";
export type FilesApiFailurePayload = {
    message?: string;
    error?: string;
};
export type FilesDownloadResponse = {
    files?: File.File.File[];
};

export async function readFailureMessage(response: Response, fallbackMessage: string): Promise<string> {
    let responsePayload: FilesApiFailurePayload | null = null;
    try {
        responsePayload = (await response.json()) as FilesApiFailurePayload;
    } catch {
        responsePayload = null;
    }

    const message = responsePayload?.message?.trim() || responsePayload?.error?.trim();
    return message || `${fallbackMessage} (${response.status})`;
}
