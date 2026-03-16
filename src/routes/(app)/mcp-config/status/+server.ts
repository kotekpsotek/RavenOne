import { json, type RequestHandler } from "@sveltejs/kit";
import { performDownloadLikeOperation } from "../downloadLike";
import type { MCPConnectionStatusObject } from "@ravenlens/shared/mcp";

/** Same as credetnials/download although it downloads the status without credentials */
export const POST: RequestHandler = async ({ request, cookies }) => {
    // 1. Make download operation
    const resultDownloadOp = await performDownloadLikeOperation(request, cookies);
    if (resultDownloadOp instanceof Response) {
        return resultDownloadOp;
    }
    
    // 2. Return download credentials with status
    return json(
        {
            ...resultDownloadOp.status
        } satisfies MCPConnectionStatusObject,
        { status: 200 }
    );
}
