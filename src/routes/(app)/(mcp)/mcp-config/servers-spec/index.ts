import { json, type RequestHandler } from "@sveltejs/kit";
import { performDownloadLikeOperation } from "../downloadLike";
import { ConnectWithMCPMiddlewareCustomerServer } from "@ravenlens/backend/mcp-interface";

/**
 * Downloads the mcp servers from the middleware server
*/
export const POST: RequestHandler = async ({ request, cookies }) => {
    try {
        // 1. Make credetnials download operation
        const resultDownloadOp = await performDownloadLikeOperation(request, cookies);
        if (resultDownloadOp instanceof Response) {
            return resultDownloadOp;
        }
    
        // 2. Check is status online to proceed
        if (resultDownloadOp.status.status !== "connected") {
            return json({ ok: false, message: `Credentials are invalid so we cannot connect with MCP Middleware server` }, { status: 403 });
        }
    
        // 3. Downloads MCP Servers specification from user middleware server
        const mcpConnectionInterface = new ConnectWithMCPMiddlewareCustomerServer(resultDownloadOp.credentials);
        const mcpJSONStringSpec = await mcpConnectionInterface.downloadCurrentSpecificationJSONString();
        
        // 4. Return mcp server spec as json
        if (mcpJSONStringSpec) {
            const mcpJSONParsed = JSON.parse(mcpJSONStringSpec);
            return json(mcpJSONParsed, { status: 200 });
        }
        else return new Response(null, { status: 400 });
    }
    catch(err) {
        console.error(`Cannot download mcp connections because of error`, err);
        return new Response(null, { status: 500 });
    }
}

/**
 * Updates the MCP Serves
 */
export const PUT: RequestHandler = async ({ request, cookies }) => {
    // 1. Verify request body
    const { workspaceId, mcpConfig } = await request.json() as {
        workspaceId: string;
        mcpConfig: string;
    }
    if (!workspaceId || !mcpConfig.trim().length) {
        return new Response(null, { status: 400 });
    }
    
    // 2. Make credetnials download operation
    const resultDownloadOp = await performDownloadLikeOperation(request, cookies);
    if (resultDownloadOp instanceof Response) {
        return resultDownloadOp;
    }

    // 3. Save the MCP config
    const mcpConnectionInterface = new ConnectWithMCPMiddlewareCustomerServer(resultDownloadOp.credentials);
    const isSaved = await mcpConnectionInterface.saveMCPConfigJsonString(mcpConfig);

    // 4. Return response
    if (isSaved) {
        return new Response(null, { status: 200 });
    }
    else return new Response(null, { status: 403 });
}
