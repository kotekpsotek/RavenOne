import { extractBearerToken } from "$lib/server/auth/request";
import { prefetchWorkspaceWithMembers } from "$lib/server/db";
import { downloadCurrentUser } from "$lib/utils/auth";
import { DB_Models } from "@ravenlens/backend";
import type { RequestHandler } from "@sveltejs/kit";

export const DELETE: RequestHandler = async ({ request, url }) => {
    const { workspaceId, invitementId } = await request.json() as {
        workspaceId: string;
        invitementId: string;
    };

    if (!workspaceId || !invitementId) {
        return new Response(JSON.stringify({ error: "workspaceId and invitementId are required" }), {
            status: 400,
            headers: { "content-type": "application/json" }
        });
    }

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

    // Delete invited member
    if (!thisUserAWorkspaceMember.permissions.includes("manage_workspace_members") && userWorkspacesQuota.ownerUserId !== authenticationResponse.data.user.id) {
        return new Response(JSON.stringify({ message: "You've no permission to delete invited member from this workspace" }), {
            status: 401
        })
    }

    // Remove member from database
    await DB_Models.Workspace.Workspace.workspaceModel.findOneAndUpdate(
        { id: workspaceId },
        {
            $pull: {
                workspaceInvitements: { id: invitementId }
            }
        }
    );
    
    // Return success status
    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
    });
}
