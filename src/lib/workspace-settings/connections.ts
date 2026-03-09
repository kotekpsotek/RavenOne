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

type WorkspaceMembersMutationResponse = {
    status?: boolean;
    ok?: boolean;
    updated?: boolean;
    deleted?: boolean;
    addedCount?: number;
    message?: string;
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

function buildWorkspaceMembersError(response: Response, responseBody: WorkspaceMembersMutationResponse | undefined, fallback: string): string {
    return asNonEmptyString(responseBody?.error)
        ?? asNonEmptyString(responseBody?.message)
        ?? `${fallback} (${response.status})`;
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
    const workspaceId = get(selectedWorkspace)?.id;
    if (!workspaceId) {
        setAlert("warning", "Inviting unavailable", "Select workspace before inviting members.");
        return false;
    }

    if (!users.length) {
        setAlert("warning", "No members selected", "Select at least one member to invite.");
        return false;
    }

    let response: Response;
    try {
        response = await fetchAuthenticated("/add_invitements", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                workspaceId,
                workspaceInvitements: users
            })
        });
    } catch {
        setAlert("error", "Invitation failed", "Cannot reach workspace members service.");
        return false;
    }

    if (!response.ok) {
        let responseBody: WorkspaceMembersMutationResponse | undefined = undefined;
        try {
            responseBody = await response.json() as WorkspaceMembersMutationResponse;
        }
        catch {}

        if (response.status === 402) {
            setAlert(
                "warning",
                "Plan upgrade required",
                buildWorkspaceMembersError(
                    response,
                    responseBody,
                    "This workspace reached your current plan member limit. Upgrade your plan to invite more members."
                )
            );

            return false;
        }
        
        setAlert(
            "error",
            "Invitation failed",
            buildWorkspaceMembersError(response, responseBody, "Cannot invite members")
        );
        return false;
    }
    
    setTimeout(() => {
        window.location.reload();
    }, 500);
    setAlert("success", "Members added", `All members are added`);
    return true;
}

export const deleteInvitementRequest: ComponentProps<UI.Workspace.Settings.WorkspaceMembersSettingScreen>["deleteInvitementRequest"] = async (invitement: Workspace.Workspace.WorkspaceMemberInvitement) => {
    const workspaceId = get(selectedWorkspace)?.id;
    if (!workspaceId) {
        setAlert("warning", "Deletion unavailable", "Select workspace before deleting invitations.");
        return false;
    }

    if (!invitement.id) {
        setAlert("warning", "Deletion unavailable", "Invitation identifier is missing.");
        return false;
    }

    let response: Response;
    try {
        response = await fetchAuthenticated("/delete_invitement", {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                workspaceId,
                invitementId: invitement.id
            })
        });
    } catch {
        setAlert("error", "Invitation deletion failed", "Cannot reach workspace members service.");
        return false;
    }

    const responseBody = await response.json();
    if (!response.ok || responseBody?.ok === false) {
        setAlert("error", "Invitation deletion failed", buildWorkspaceMembersError(response, responseBody, "Cannot delete invitation"));
        return false;
    }

    setAlert("success", "Invitation deleted", "Workspace invitation was deleted successfully.");
    return true;
}

export const deleteMemberRequest: ComponentProps<UI.Workspace.Settings.WorkspaceMembersSettingScreen>["deleteMemberRequest"] = async (userToDelete: Workspace.Workspace.WorkspaceUser) => {
    const workspaceId = get(selectedWorkspace)?.id;
    if (!workspaceId) {
        setAlert("warning", "Removal unavailable", "Select workspace before removing members.");
        return false;
    }

    const userId = asNonEmptyString(userToDelete.userId);
    if (!userId) {
        setAlert("warning", "Removal unavailable", "Cannot remove member without user id.");
        return false;
    }

    let response: Response;
    try {
        response = await fetchAuthenticated("/delete_member", {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                workspaceId,
                userId
            })
        });
    } catch {
        setAlert("error", "Member removal failed", "Cannot reach workspace members service.");
        return false;
    }

    const responseBody = await response.json();
    if (!response.ok || responseBody?.ok === false || responseBody?.deleted === false) {
        setAlert("error", "Member removal failed", buildWorkspaceMembersError(response, responseBody, "Cannot remove member"));
        return false;
    }

    setAlert("success", "Member removed", "Workspace member was removed successfully.");
    return true;
}

export const updateMemberPermissions: ComponentProps<UI.Workspace.Settings.WorkspaceMembersSettingScreen>["updateMemberPermissions"] = async (userId: string, permissions: Permissions.Workspace.WorkspaceUserPermissions[]) => {
    const workspaceId = get(selectedWorkspace)?.id;
    if (!workspaceId) {
        setAlert("warning", "Update unavailable", "Select workspace before updating permissions.");
        return false;
    }

    const normalizedUserId = asNonEmptyString(userId);
    if (!normalizedUserId) {
        setAlert("warning", "Update unavailable", "Cannot update permissions without user id.");
        return false;
    }

    let response: Response;
    try {
        response = await fetchAuthenticated("/update_member_permissions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                workspaceId,
                userId: normalizedUserId,
                permissions
            })
        });
    } catch {
        setAlert("error", "Permission update failed", "Cannot reach workspace members service.");
        return false;
    }

    const responseBody = await response.json();
    if (!response.ok || responseBody?.ok === false || responseBody?.updated === false) {
        setAlert("error", "Permission update failed", buildWorkspaceMembersError(response, responseBody, "Cannot update member permissions"));
        return false;
    }

    setAlert("success", "Permissions updated", "Workspace member permissions were updated successfully.");
    return true;
}
