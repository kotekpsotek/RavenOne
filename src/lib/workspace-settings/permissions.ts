import { Permissions, type Workspace } from "@ravenlens/shared";

type WorkspaceEntry = Workspace.Workspace.WorkspaceUserEntryLoaded | undefined;

export type WorkspaceSettingsPermission = Permissions.Workspace.WorkspaceUserPermissions;

type WorkspaceSettingsAccessRule = {
    path: string;
    permission: WorkspaceSettingsPermission;
};

export const workspaceSettingsAccessRules: WorkspaceSettingsAccessRule[] = [
    {
        path: "/workspace-settings/common",
        permission: "manage_workspace_settings"
    },
    {
        path: "/workspace-settings/members",
        permission: "manage_workspace_members"
    },
    {
        path: "/workspace-settings/ai-models",
        permission: "manage_workspace_ai_models"
    }
];

export function workspaceCanAccessPermission(workspace: WorkspaceEntry, permission: WorkspaceSettingsPermission): boolean {
    if (!workspace) {
        return false;
    }

    if (workspace.isOwner) {
        return true;
    }

    return workspace.userPermissions.includes(permission);
}

export function getAllowedWorkspaceSettingsPaths(workspace: WorkspaceEntry): string[] {
    return workspaceSettingsAccessRules
        .filter(({ permission }) => workspaceCanAccessPermission(workspace, permission))
        .map(({ path }) => path);
}

export function getFirstAllowedWorkspaceSettingsPath(workspace: WorkspaceEntry): string | undefined {
    return getAllowedWorkspaceSettingsPaths(workspace).at(0);
}

export function canAccessWorkspaceSettings(workspace: WorkspaceEntry): boolean {
    return getAllowedWorkspaceSettingsPaths(workspace).length > 0;
}

export function workspaceCanAccessSettingsPath(workspace: WorkspaceEntry, pathname: string): boolean {
    return getAllowedWorkspaceSettingsPaths(workspace).some(path => pathname.endsWith(path));
}
