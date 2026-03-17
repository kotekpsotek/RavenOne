import { getAndValidateAuthenticated } from "$lib/server/auth/request";
import { assumeStatus, isMCPMiddlewareServerURLValid, isUserMCPConfigRouteAccessPermited } from "../../common";
import { json, type RequestHandler } from "@sveltejs/kit";
import type { MCPConnectionStatusObject, MCPCredentials, MCPCredentialsBackendWithoutStatus } from "@ravenlens/shared/mcp";
import { DB_Models } from "@ravenlens/backend";
import { ConnectWithMCPMiddlewareCustomerServer } from "@ravenlens/backend/mcp-interface";

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
export const PUT: RequestHandler = async ({ request, cookies, fetch }) => {
    try {
        // 1. Verify request body
        const { workspaceId, credentials } = await request.json() as {
            workspaceId: string;
            credentials: MCPCredentialsBackendWithoutStatus;
        }

        const normalizedServerURL = String(credentials?.serverURL ?? "").trim();
        const normalizedSecretPassword = String(credentials?.secretPassword ?? "").trim();
        const isRemovalRequested = normalizedServerURL.length === 0 && normalizedSecretPassword.length === 0;

        const areCredentialsCorrect = Boolean(
            normalizedSecretPassword.length
            && normalizedServerURL.length
            && isMCPMiddlewareServerURLValid(normalizedServerURL)
        );

        const isPartialCredentialsProvided = normalizedServerURL.length === 0 || normalizedSecretPassword.length === 0;
        if (!workspaceId || !credentials || (!isRemovalRequested && (!areCredentialsCorrect || isPartialCredentialsProvided))) {
            return new Response(null, { status: 400 });
        }
        
        // 2. Is user logged-in 
        const isAuth = await getAndValidateAuthenticated(request, cookies, true, fetch);
        if (isAuth instanceof Response) {
            return isAuth
        }
    
        // 3. Has user permission
        const isUserPermitted = await isUserMCPConfigRouteAccessPermited(workspaceId, isAuth.user);
        if (!isUserPermitted) {
            return new Response(null, { status: 401 });
        }

        if (isRemovalRequested) {
            await DB_Models.MCP.mcpCredentialsModal.deleteOne({ workspaceId });

            const removedStatus: MCPConnectionStatusObject = {
                status: "not-specified"
            };

            return json({ status: removedStatus }, { status: 200 });
        }
    
        // 4. Object enjoying each property
        const mutualObject: Pick<MCPCredentials, "serverURL" | "secretPassword"> = {
            serverURL: normalizedServerURL,
            secretPassword: normalizedSecretPassword
        }
    
        // 5. Check is server hosted by ping
        const mcpConnectionInterface = new ConnectWithMCPMiddlewareCustomerServer({ ...mutualObject, workspaceId: workspaceId });
        const isServerHosted = await mcpConnectionInterface.isUserMCPServerConnectable();
        const assumedStatus = assumeStatus(
            {
                ...credentials,
                serverURL: normalizedServerURL,
                secretPassword: normalizedSecretPassword
            },
            isServerHosted
        );
        
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
