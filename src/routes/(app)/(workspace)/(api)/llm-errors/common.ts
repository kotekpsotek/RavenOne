import { extractBearerToken } from "$lib/server/auth/request";
import { prefetchWorkspaceWithMembers } from "$lib/server/db";
import { downloadCurrentUser } from "$lib/utils/auth";

/** Checking is user permitted to display and manage llm-errors */
export async function precheck(request: Request, url: URL, workspaceId: string) {
    const jwt = extractBearerToken(request);
    if (!jwt) {
        return new Response(JSON.stringify({ message: "You're not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" }
        });
    }

    const authenticationResponse = await downloadCurrentUser(jwt, url.origin);
    if (!authenticationResponse.status || !authenticationResponse.data) {
        return new Response(JSON.stringify({ message: "You're not authenticated member" }), {
            status: 401,
            headers: { "content-type": "application/json" }
        });
    }

    const currentUserId = authenticationResponse.data.user.id;
    const workspace = await prefetchWorkspaceWithMembers(workspaceId);
    if (!workspace) {
        return new Response(JSON.stringify({ message: "Following workspace doesn't exist" }), {
            status: 404,
            headers: { "content-type": "application/json" }
        });
    }

    const thisUserAWorkspaceMember = workspace.workspaceMembers.find(member => member.user.id === currentUserId);
    const canManageMembers = workspace.ownerUserId === currentUserId
        || Boolean(thisUserAWorkspaceMember?.permissions.includes("manage_workspace_ai_models"));

    if (!canManageMembers) {
        return new Response(JSON.stringify({ message: "You've no permission to delete member from this workspace" }), {
            status: 401,
            headers: { "content-type": "application/json" }
        });
    }

    return true;
}