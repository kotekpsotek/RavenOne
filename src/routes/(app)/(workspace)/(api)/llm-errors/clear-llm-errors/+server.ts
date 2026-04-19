import { extractBearerToken } from "$lib/server/auth/request";
import { prefetchWorkspaceWithMembers } from "$lib/server/db";
import { downloadCurrentUser } from "$lib/utils/auth";
import { DB_Models } from "@ravenlens/backend";
import type { RequestHandler } from "@sveltejs/kit";
import { precheck } from "../common";

/**
 * 1. Only user is workspace member and has right permission can do this operation
 * 2. Remove all errors correlated with specified workspace
*/
export const DELETE: RequestHandler = async ({ request, url }) => {
    const { workspaceId } = await request.json();

    // 1. Check user permissions
    const checked = await precheck(request, url, workspaceId);
    if (checked instanceof Response) return checked;
    
    // 2.
    const _llmErrorsDeletionResult = await DB_Models.Workspace.LLMErrors.llmErrorsModel.deleteMany({
        workspaceId: workspaceId
    });

    // 3.
    return new Response(null, { status: 200 });
}
