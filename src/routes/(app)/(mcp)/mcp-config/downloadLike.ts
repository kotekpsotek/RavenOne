import { getAndValidateAuthenticated } from "$lib/server/auth/request";
import type { Cookies } from "@sveltejs/kit";
import { assumeStatus, isUserMCPConfigRouteAccessPermited } from "./common";
import { DB_Models } from "@ravenlens/backend";
import { ConnectWithMCPMiddlewareCustomerServer } from "@ravenlens/backend/mcp-interface";

export async function performDownloadLikeOperation(request: Request, cookies: Cookies, fetchFn: typeof fetch) {
    // 1. Verify request body
    const { workspaceId } = await request.json() as {
        workspaceId: string;
    }
    if (!workspaceId) {
        return new Response(null, { status: 400 });
    }
    
    // 2. Is user logged-in 
    const isAuth = await getAndValidateAuthenticated(request, cookies, true, fetchFn);
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
    const mcpConnectionInterface = new ConnectWithMCPMiddlewareCustomerServer(mcpForWorkspace);
    const isConnectedOnline = await mcpConnectionInterface.isUserMCPServerConnectable();
    
    // 7. Get status
    const status = assumeStatus(mcpForWorkspace, isConnectedOnline);

    // 8. Return status and credentials
    return {
        status: status,
        credentials: mcpForWorkspace
    }
}