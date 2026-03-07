import { json, type RequestHandler } from "@sveltejs/kit";
import { downloadCurrentUser } from "$lib/utils/auth";
import { prefetchWorkspaceWithMembers } from "$lib/server/db";
import { extractBearerToken, getAuthenticatedPayload } from "$lib/server/auth/request";

export const POST: RequestHandler = async ({ request, url }) => {
    const { workspaceId } = await request.json() as {
        workspaceId: string;
    };

    // 1. Check is user authenticated
    const jwt = extractBearerToken(request);
    if (!jwt) {
        return new Response(JSON.stringify({ message: "You're not authenticated" }), {
            status: 401
        })
    }

    const authenticationResponse = await downloadCurrentUser(jwt, url.origin);
    if (!authenticationResponse.status || !authenticationResponse.data) {
        return new Response(JSON.stringify({ message: "You're not authenticated member" }), {
            status: 401
        })
    }

    // Prefetch workspace user is poiniting to
    const userWorkspacesQuota = await prefetchWorkspaceWithMembers(workspaceId);
    if (!userWorkspacesQuota) {
        return new Response(JSON.stringify({ message: "Following workspace doesn't exist" }), {
            status: 404
        })
    }
    
    // Find member is this user within this workspace
    const thisUserAWorkspaceMember = userWorkspacesQuota.workspaceMembers.find(member => member.user.id === authenticationResponse.data?.user.id)
    
    // Check is user member of workspace with `workspaceId`
    if (!thisUserAWorkspaceMember) {
        return new Response(JSON.stringify({ message: "You're not workspace member" }), {
            status: 401
        })
    }

    // Check has user adequate permissions in workspace to invite new members
    return json(userWorkspacesQuota.workspaceInvitements, { status: 200 });
}
