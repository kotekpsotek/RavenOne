import { DB_Models } from "@ravenlens/backend";
import type { RequestHandler } from "@sveltejs/kit";
import { precheck } from "../common";
import { json } from "@sveltejs/kit";

/**
 * 1. Only user is workspace member and has right permission can do this operation
 * 2. Return list with workspace members sorted in descending order from the newest to the oldest
*/
export const POST: RequestHandler = async ({ request, url }) => {
    const { workspaceId } = await request.json();
    
        // 1. Check user permissions
        const checked = await precheck(request, url, workspaceId);
        if (checked instanceof Response) return checked;
        
        // 2. Download
        const foundResults = await DB_Models.Workspace.LLMErrors.llmErrorsModel.aggregate(
            [
                {
                    $match: {
                        workspaceId: workspaceId,
                    }
                },
                {
                    $sort: {
                        creationDate: -1
                    }
                },
                {
                    $project: {
                        _id: 0,
                        __v: 0
                    }
                }
            ]
        );
    
        // 3. Return members
        return json(foundResults, { status: 200 });
}
