import { json, type RequestHandler } from "@sveltejs/kit";
import type { MCPCredentials } from "@ravenlens/shared/mcp";
import { performDownloadLikeOperation } from "../../downloadLike";

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
    // 1. Make download operation
    const resultDownloadOp = await performDownloadLikeOperation(request, cookies);
    if (resultDownloadOp instanceof Response) {
        return resultDownloadOp;
    }
    
    // 2. Return download credentials with status
    return json(
        {
            ...resultDownloadOp.credentials,
            status: resultDownloadOp.status
        } satisfies MCPCredentials,
        { status: 200 }
    );
}
