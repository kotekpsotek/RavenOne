import { type DropPosition, type FilesDownloadResponse } from "../utils";
import type { File } from "$lib/sharedCompat";
import { requestFilesApi } from "./common";
import type { DisabledModelsResponse } from "../../../routes/(app)/(workspace)/(api)/models/disabled/disabled";

export type ShareFileResponse = {
    shareUrl?: string;
    shareId?: string;
    sharedAt?: string;
};

export async function downloadFilesRequest(workspaceId: string) {
    return await requestFilesApi<FilesDownloadResponse>(
        "/files/api/download/files",
        "POST",
        {
            workspaceId
        },
        "File sync failed",
        "Cannot download files"
    );
}

export async function deleteFileRequest(
    workspaceId: string,
    fileId: string
) {
    return await requestFilesApi<{ deleted?: boolean }>(
        "/files/api/delete",
        "DELETE",
        {
            workspaceId,
            fileId: fileId
        },
        "Delete failed",
        "Cannot delete file"
    )
}

export async function newFileRequest(
    workspaceId: string,
    targetId: string | null,
    name: string
) {
    return await requestFilesApi<{ createdFile?: File.File.File }>(
        "/files/api/create",
        "POST",
        {
            workspaceId,
            targetId,
            name
        },
        "File creation failed",
        "Cannot create file"
    )
}

export async function changeFilePositionRequest(
    workspaceId: string,
    sourceId: string,
    targetId: string | null,
    postion: DropPosition
) {
    return await requestFilesApi<{ moved?: boolean }>(
        "/files/api/change_position",
        "PUT",
        {
            workspaceId,
            sourceId,
            targetId,
            position: postion
        },
        "File move failed",
        "Cannot move file"
    )
}

export async function renameFileRequest(
    workspaceId: string,
    fileId: string,
    newName: string
) {
    return await requestFilesApi<{ updated?: boolean }>(
        "/files/api/rename",
        "PUT",
        {
            workspaceId,
            fileId: fileId,
            name: newName
        },
        "Rename failed",
        "Cannot rename file"
    );
}

export async function changeIconFileRequest(
    workspaceId: string,
    fileId: string,
    icon: string | null
) {
    return await requestFilesApi<{ updated?: boolean }>(
        "/files/api/icon",
        "PUT",
        {
            workspaceId,
            fileId: fileId,
            icon: icon
        },
        icon ? "Icon update failed" : "Cannot delete file icon",
        icon ? "Cannot update file icon" : "Cannot delete file icon"
    );
}

export async function changeWalperFileRequest(
    workspaceId: string,
    fileId: string,
    walperUrl: string | null
) {
    return requestFilesApi<{ updated?: boolean }>(
        "/files/api/walper",
        "PUT",
        {
            workspaceId,
            fileId: fileId,
            walper: walperUrl
        },
        walperUrl ? "Wallpaper update failed" : "Wallpaper deletion failed",
        walperUrl ? "Cannot update file wallpaper" : "Cannot delete file wallpaper"
    )
}

export async function shareFileRequest(workspaceId: string, fileId: string) {
    return requestFilesApi<ShareFileResponse>(
        "/files/api/share",
        "POST",
        {
            workspaceId,
            fileId
        },
        "Share failed",
        "Cannot generate a share link"
    );
}

export async function downloadUnavaiableModelsRequest(requestBody: { workspaceId: string }) {
    return requestFilesApi<DisabledModelsResponse>(
        "/models/disabled",
        "POST",
        { ...requestBody },
        "Unavaiable models downloading failed",
        "Cannot download the list with Unavaiable models"
    )
}
