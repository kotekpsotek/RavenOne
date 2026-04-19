import { DB_Models } from "@ravenlens/backend";
import type { RequestHandler } from "@sveltejs/kit";
import { precheck } from "../common";
import { json } from "@sveltejs/kit";
import { dev } from "$app/environment";
import type { Workspace } from "@ravenlens/shared";

/**
 * 1. Only user is workspace member and has right permission can do this operation
 * 2. Return list with workspace members sorted in descending order from the newest to the oldest
*/
function buildSimulatedLLMErrors(workspaceId: string): Workspace.WorkspaceLLMErrors.LLMError[] {
    const providerCycle: Workspace.WorkspaceLLMErrors.LLMError["provider"][] = [
        "OpenAI",
        "Anthropic",
        "Google",
        "OpenAI",
        "Unknown"
    ];

    return Array.from({ length: 5 }, (_, index) => ({
        platform: index % 2 === 0 ? "ravenone" : "ravencode",
        workspaceId,
        provider: providerCycle[index],
        name: index === 0
            ? "Quota Exceeded"
            : { different: `Simulated error ${index + 1}` },
        description: [
            `Simulated LLM error #${index + 1} for development mode.`,
            `Workspace: ${workspaceId}`,
            `Provider: ${providerCycle[index]}`
        ].join("\n"),
        creationDate: new Date(Date.now() - index * 60_000)
    }));
}

export const POST: RequestHandler = async ({ request, url }) => {
    const { workspaceId } = await request.json();
    
        // 1. Check user permissions
        const checked = await precheck(request, url, workspaceId);
        if (checked instanceof Response) return checked;
        
        // 2. Download
        let foundResults = await DB_Models.Workspace.LLMErrors.llmErrorsModel.aggregate(
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

        // Simulation for developement mode
        if (dev && !foundResults.length) {
            foundResults = buildSimulatedLLMErrors(workspaceId);
        }
    
        // 3. Return members
        return json(foundResults, { status: 200 });
}
