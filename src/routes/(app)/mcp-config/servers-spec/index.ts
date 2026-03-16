import { json, type RequestHandler } from "@sveltejs/kit";
import { performDownloadLikeOperation } from "../downloadLike";
import { ConnectWithMCPMiddlewareCustomerServer } from "@ravenlens/backend/mcp-interface";

/**
 * Downloads the mcp connections from the server
*/
export const POST: RequestHandler = async ({ request, cookies }) => {
    try {
        // 1. Make download operation
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
