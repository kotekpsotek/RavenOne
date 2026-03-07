import { avaiableWorkspaces, selectedWorkspace } from "$lib/stores/workspace";
import { setAlert } from "$lib/utils/alert";
import { fetchAuthenticated } from "$lib/utils/fetch";
import type { UI } from "@ravenlens/frontend";
import type { Workspace, Permissions } from "@ravenlens/shared";
import type { ComponentProps } from "svelte";
import { get } from "svelte/store";

// Types
type DeleteWorkspaceResponse = {
    status?: boolean;
    deleted?: boolean;
    workspaceId?: string;
    error?: string;
};

type SaveWorkspaceResponse = {
    status?: boolean;
    saved?: boolean;
    workspace?: {
        id?: string;
        name?: string;
        imageUrl?: string;
        ownerUserId?: string;
    };
    error?: string;
};


// Util functions
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
}

function readImageFile(image: unknown): File | null {
    if (!isRecord(image)) {
        return null;
    }

    const imageCandidate = image.imageFile;
    if (!(imageCandidate instanceof File) || imageCandidate.size <= 0) {
        return null;
    }

    return imageCandidate;
}

function readImageUrl(image: unknown): string | undefined {
    if (!isRecord(image)) {
        return undefined;
    }

    return asNonEmptyString(image.url);
}


// Src Functions
export const sendDeleteWorkspace: ComponentProps<UI.Workspace.Settings.WorkspaceSettingsScreen>["onDeleteWorkspace"] = async () => {
    const workspaceId = get(selectedWorkspace)?.id;
    if (!workspaceId) {
        setAlert("warning", "Workspace deletion unavailable", "Select workspace before trying to delete it.");
        return false;
    }

    let response: Response;
    try {
        response = await fetchAuthenticated(`/workspace-settings/api?workspaceId=${encodeURIComponent(workspaceId)}`, {
            method: "DELETE"
        });
    } catch {
        setAlert("error", "Workspace deletion failed", "Cannot reach workspace deletion service.");
        return false;
    }

    let responseBody: DeleteWorkspaceResponse | undefined;
    try {
        responseBody = await response.json() as DeleteWorkspaceResponse;
    } catch {
        responseBody = undefined;
    }

    if (!response.ok || !responseBody?.status || !responseBody.deleted) {
        const errorMessage = responseBody?.error ?? `Cannot delete workspace (${response.status})`;
        setAlert("error", "Workspace deletion failed", errorMessage);
        return false;
    }

    let remainingWorkspaces: Workspace.Workspace.WorkspaceUserEntryLoaded[] = [];
    avaiableWorkspaces.update(existingWorkspaces => {
        remainingWorkspaces = existingWorkspaces.filter(workspace => workspace.id !== workspaceId);
        return remainingWorkspaces;
    });

    selectedWorkspace.set(remainingWorkspaces[0]);
    setAlert("success", "Workspace deleted", "Workspace was deleted successfully.");
    return true;
}

export const sendSaveWorkspaceChanges: ComponentProps<UI.Workspace.Settings.WorkspaceSettingsScreen>["onSaveWorkspaceChanges"] = async (name, image) => {
    const currentWorkspaceLoaded = get(selectedWorkspace);
    if (!currentWorkspaceLoaded?.id) {
        setAlert("warning", "Workspace save unavailable", "Select workspace before trying to save changes.");
        return false;
    }

    const workspaceId = currentWorkspaceLoaded.id;

    const normalizedWorkspaceName = name.trim();
    if (!normalizedWorkspaceName) {
        setAlert("warning", "Workspace name required", "Workspace name cannot be empty.");
        return false;
    }

    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("name", normalizedWorkspaceName);

    const imageFile = readImageFile(image);
    if (imageFile) {
        formData.set("image", imageFile);
    } else {
        const imageUrl = readImageUrl(image);
        if (imageUrl) {
            formData.set("imageUrl", imageUrl);
        }
    }

    let response: Response;
    try {
        response = await fetchAuthenticated(`/workspace-settings/api?workspaceId=${encodeURIComponent(workspaceId)}`, {
            method: "POST",
            body: formData
        });
    } catch {
        setAlert("error", "Workspace save failed", "Cannot reach workspace settings service.");
        return false;
    }

    let responseBody: SaveWorkspaceResponse | undefined;
    try {
        responseBody = await response.json() as SaveWorkspaceResponse;
    } catch {
        responseBody = undefined;
    }

    if (!response.ok || !responseBody?.status || !responseBody.saved) {
        const errorMessage = responseBody?.error ?? `Cannot save workspace changes (${response.status})`;
        setAlert("error", "Workspace save failed", errorMessage);
        return false;
    }

    const savedName = asNonEmptyString(responseBody.workspace?.name) ?? normalizedWorkspaceName;
    const savedImageUrl = asNonEmptyString(responseBody.workspace?.imageUrl)
        ?? asNonEmptyString(currentWorkspaceLoaded.imageUrl)
        ?? "";

    selectedWorkspace.set({
        ...currentWorkspaceLoaded,
        name: savedName,
        imageUrl: savedImageUrl
    });

    let savedWorkspaceEntry: Workspace.Workspace.WorkspaceUserEntryLoaded | undefined;
    avaiableWorkspaces.update(existingWorkspaces => {
        const updatedWorkspaces = existingWorkspaces.map(workspace => {
            if (workspace.id !== workspaceId) {
                return workspace;
            }

            const updatedWorkspace = {
                ...workspace,
                name: savedName,
                imageUrl: savedImageUrl
            };

            savedWorkspaceEntry = updatedWorkspace;
            return updatedWorkspace;
        });

        return updatedWorkspaces;
    });

    if (savedWorkspaceEntry) {
        selectedWorkspace.set(savedWorkspaceEntry);
    }

    setAlert("success", "Workspace saved", "Workspace changes were saved successfully.");
    setTimeout(() => location.reload())
    return true;
}

export const inviteMemberRequest: ComponentProps<UI.Workspace.Settings.WorkspaceMembersSettingScreen>["inviteMemberRequest"] = async (users: Workspace.Workspace.WorkspaceMemberInvitement[]) => {
    
}

export const deleteInvitementRequest: ComponentProps<UI.Workspace.Settings.WorkspaceMembersSettingScreen>["deleteInvitementRequest"] = async (invitement: Workspace.Workspace.WorkspaceMemberInvitement) => {
    
}

export const deleteMemberRequest: ComponentProps<UI.Workspace.Settings.WorkspaceMembersSettingScreen>["deleteMemberRequest"] = async (userToDelete: Workspace.Workspace.WorkspaceUser) => {
    
}

export const updateMemberPermissions: ComponentProps<UI.Workspace.Settings.WorkspaceMembersSettingScreen>["updateMemberPermissions"] = async (userId: string, permissions: Permissions.Workspace.WorkspaceUserPermissions[]) => {
    
}
