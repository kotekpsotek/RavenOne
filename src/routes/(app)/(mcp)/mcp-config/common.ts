import { DB_Models } from "@ravenlens/backend";
import type { Profile } from "@ravenlens/shared";
import type { MCPConnectionStatusObject, MCPCredentialsBackendWithoutStatus } from "@ravenlens/shared/mcp";
import type { Document } from "mongoose";

export function assumeStatus(serverCredentials: MCPCredentialsBackendWithoutStatus, isConnectedOnline: boolean): MCPConnectionStatusObject {
    if (!serverCredentials.secretPassword || !serverCredentials.serverURL) {
        return { status: "not-specified" };
    }
    else if (isConnectedOnline) {
        return {
            status: "connected"
        }
    }
    else return {
        status: "invalid-connection",
        reason: "You've specified wrong mcp server connection credentials or server isn't online"
    }
}

export function isMCPMiddlewareServerURLValid(serverURL: string): boolean {
    try {
        const url = new URL(serverURL);
        const isRightProtocol = serverURL.startsWith("https://") || serverURL.startsWith("http://");
        
        return isRightProtocol && url.origin.trim().length > 0;
    }
    catch {
        return false;
    }
}

/**
 * Check whether is member workspace member and whether is member permitted to do the action
*/
export async function isUserMCPConfigRouteAccessPermited(workspaceId: string, user: Profile & Document): Promise<boolean> {
    // 1. Download workspace and checks whether does exist
    const userWorkspace = await DB_Models.Workspace.Workspace.workspaceModel.findOne({ id: workspaceId }).populate("workspaceMembers.user") as any as Omit<DB_Models.Workspace.Workspace.WorkspaeFetchedDB, "workspaceMembers"> & {
        workspaceMembers: (
            Omit<DB_Models.Workspace.Workspace.MemberWorkspaceDB, "user"> & { user: Profile & Document }
        )[]
    };

    if (!userWorkspace) {
        return false;
    }

    // 2. Check does member exists
    const workspaceMemberFetch = userWorkspace.workspaceMembers.find(member => member.user.id === user.id);
    if (!workspaceMemberFetch) {
        return false;
    }

    // 3. Check member permission
    const hasRequiredPermission = workspaceMemberFetch.permissions.includes("manage_workspace_ai_models");
    
    // Return result
    return hasRequiredPermission || userWorkspace.ownerUserId === user.id;
}
