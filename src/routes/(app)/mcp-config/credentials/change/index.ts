import { getAndValidateAuthenticated } from "$lib/server/auth/request";
import { assumeStatus, isMCPMiddlewareServerURLValid, isUserMCPConfigRouteAccessPermited, isUserMCPServerConnectable } from "../../common";
import { json, type RequestHandler } from "@sveltejs/kit";
import type { MCPConnectionStatus, MCPCredentials, MCPCredentialsBackendWithoutStatus } from "@ravenlens/shared/mcp";
import { DB_Models } from "@ravenlens/backend";

/**
 * Requirements:
 * 1. User has to send full configuration: serverURL, password
 * 
 * Check:
 * 1. Is user logged-in (todo)
 * 2. Has user permission to download
 * 3. Check is server configured
 * 4. Check is server online
 */
export const PUT: RequestHandler = async ({ request, cookies }) => {
    try {
        // 1. Verify request body
        const { workspaceId, credentials } = await request.json() as {
            workspaceId: string;
            credentials: MCPCredentialsBackendWithoutStatus;
        }
        
        // 1.5. Check specified credentials
        const areCredentialsCorrect = Boolean(
            credentials?.secretPassword?.trim().length
            && credentials?.serverURL?.trim().length
            && isMCPMiddlewareServerURLValid(credentials.serverURL)
        );
        if (!workspaceId || !credentials || !areCredentialsCorrect) {
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
    
        // 4. Object enjoying each property
        const mutualObject: Pick<MCPCredentials, "serverURL" | "secretPassword"> = {
            serverURL: credentials.serverURL,
            secretPassword: credentials.secretPassword
        }
    
        // 5. Check is server hosted by ping
        const isServerHosted = await isUserMCPServerConnectable(credentials);
        const assumedStatus = assumeStatus(credentials, isServerHosted);
        
        if (!isServerHosted) {
            return json({ status: assumedStatus }, { status: 403 });
        }
    
        // 6. Save server config
        await DB_Models.MCP.mcpCredentialsModal.findOneAndUpdate(
            { workspaceId },
            {
                $set: mutualObject,
                $setOnInsert: {
                    workspaceId
                }
            },
            {
                upsert: true
            }
        );

    
        // 7. Return status ok
        return json({ status: assumedStatus }, { status: 200 });
    }
    catch(err) {
        console.error(`Cannot save/update credetnials`, err);
        return new Response(null, { status: 400 });
    }
}
