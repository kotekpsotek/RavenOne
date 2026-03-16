import { getAndValidateAuthenticated } from "$lib/server/auth/request";
import { json, type RequestHandler } from "@sveltejs/kit";
import { isUserMCPConfigRouteAccessPermited, isUserMCPServerConnectable } from "../../common";
import { DB_Models } from "@ravenlens/backend";
import type { MCPConnectionStatusObject, MCPCredentials, MCPCredentialsBackendWithoutStatus } from "@ravenlens/shared/mcp";

function assumeStatus(serverCredentials: MCPCredentialsBackendWithoutStatus, isConnectedOnline: boolean): MCPConnectionStatusObject {
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
        reason: "Server has wrong connection or isn't online"
    }
}

/**
 * Description: Download List of credetnials with actual server status. Only permitted member can access this route
 * 
 * Check:
 * 1. Is user logged-in
 * 2. Has user permission to retrive
 * 3. Check is server configured
 * 4. Check is server online
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
    // 1. Verify request body
    const { workspaceId } = await request.json() as {
        workspaceId: string;
    }
    if (!workspaceId) {
        return new Response(null, { status: 400 });
    }
    
    // 2. Is user logged-in 
    const isAuth = await getAndValidateAuthenticated(request, cookies, true);
    if (isAuth instanceof Response) {
        return isAuth
    }

    // 3. Has user permission
    const isUserPermitted = await isUserMCPConfigRouteAccessPermited(workspaceId, isAuth.user);
    if (!isUserPermitted) {
        return new Response(null, { status: 401 });
    }

    // 4. Donwload the mcp server
    const mcpForWorkspace = await DB_Models.MCP.mcpCredentialsModal.findOne({ workspaceId }).lean();
    if (!mcpForWorkspace) {
        return new Response(null, { status: 404 })
    }
    
    // 6. Check is server online
    const isConnectedOnline = await isUserMCPServerConnectable(mcpForWorkspace);
    
    // 7. Get status
    const status = assumeStatus(mcpForWorkspace, isConnectedOnline)
    
    // 8. Return status
    return json(
        {
            ...mcpForWorkspace,
            status: status
        } satisfies MCPCredentials,
        { status: 200 }
    );
}
