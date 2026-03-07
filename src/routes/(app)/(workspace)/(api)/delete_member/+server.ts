import { extractBearerToken } from "$lib/server/auth/request";
import { prefetchWorkspaceWithMembers } from "$lib/server/db";
import { downloadCurrentUser } from "$lib/utils/auth";
import { DB_Models } from "@ravenlens/backend";
import type { RequestHandler } from "@sveltejs/kit";

type DeleteMemberRequestBody = {
    workspaceId?: unknown;
    userId?: unknown;
};

function asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
}

export const DELETE: RequestHandler = async ({ request, url }) => {
    let requestBody: DeleteMemberRequestBody;
    try {
        requestBody = await request.json() as DeleteMemberRequestBody;
    } catch {
        return new Response(JSON.stringify({ error: "Invalid request body" }), {
            status: 400,
            headers: { "content-type": "application/json" }
        });
    }

    const workspaceId = asNonEmptyString(requestBody.workspaceId);
    const userId = asNonEmptyString(requestBody.userId);
    if (!workspaceId || !userId) {
        return new Response(JSON.stringify({ error: "workspaceId and userId are required" }), {
            status: 400,
            headers: { "content-type": "application/json" }
        });
    }

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
        || Boolean(thisUserAWorkspaceMember?.permissions.includes("manage_workspace_members"));

    if (!canManageMembers) {
        return new Response(JSON.stringify({ message: "You've no permission to delete member from this workspace" }), {
            status: 401,
            headers: { "content-type": "application/json" }
        });
    }

    if (workspace.ownerUserId === userId) {
        return new Response(JSON.stringify({ message: "Workspace owner cannot be removed" }), {
            status: 400,
            headers: { "content-type": "application/json" }
        });
    }

    const userProfile = await DB_Models.UserAccount.profileModel
        .findOne({ id: userId })
        .select({ _id: 1 })
        .lean<{ _id?: unknown }>();

    if (!userProfile?._id) {
        return new Response(JSON.stringify({ message: "User to delete was not found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
        });
    }

    const memberExistsInWorkspace = workspace.workspaceMembers.find(member => member.user.id === userId);
    if (!memberExistsInWorkspace) {
        return new Response(JSON.stringify({ message: "Following user is not a member of this workspace" }), {
            status: 404,
            headers: { "content-type": "application/json" }
        });
    }

    if (memberExistsInWorkspace.permissions.includes("manage_workspace_members") && currentUserId !== memberExistsInWorkspace.user.id) {
        return new Response(JSON.stringify({ message: "You cannot remove member has same management permission as you" }), { status: 403 });
    }

    const updateResult = await DB_Models.Workspace.Workspace.workspaceModel.updateOne(
        { id: workspaceId },
        {
            $pull: {
                workspaceMembers: { user: userProfile._id }
            }
        }
    );

    if (!updateResult.modifiedCount) {
        return new Response(JSON.stringify({ message: "Cannot remove member from this workspace" }), {
            status: 500,
            headers: { "content-type": "application/json" }
        });
    }

    return new Response(JSON.stringify({ ok: true, deleted: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
    });
};
