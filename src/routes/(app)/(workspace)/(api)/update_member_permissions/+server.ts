import { extractBearerToken } from "$lib/server/auth/request";
import { prefetchWorkspaceWithMembers } from "$lib/server/db";
import { getWorkspaceActiveSubscription } from "$lib/server/subscription";
import { downloadCurrentUser } from "$lib/utils/auth";
import { DB_Models } from "@ravenlens/backend";
import { Permissions } from "@ravenlens/shared";
import type { RequestHandler } from "@sveltejs/kit";

type UpdateMemberPermissionsRequestBody = {
    workspaceId?: unknown;
    userId?: unknown;
    permissions?: unknown;
};

type WorkspacePermission = Permissions.Workspace.WorkspaceUserPermissions;

const ALLOWED_WORKSPACE_PERMISSIONS = new Set<WorkspacePermission>(
    Object.keys(Permissions.Workspace.worspacePermissionLeaderBoardAndNames) as WorkspacePermission[]
);

function asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
}

function normalizePermissions(permissionsCandidate: unknown): WorkspacePermission[] {
    if (!Array.isArray(permissionsCandidate)) {
        return [];
    }

    const normalizedPermissions = new Set<WorkspacePermission>();
    for (const permissionCandidate of permissionsCandidate) {
        if (typeof permissionCandidate !== "string") {
            continue;
        }

        if (ALLOWED_WORKSPACE_PERMISSIONS.has(permissionCandidate as WorkspacePermission)) {
            normalizedPermissions.add(permissionCandidate as WorkspacePermission);
        }
    }

    return [...normalizedPermissions];
}

export const POST: RequestHandler = async ({ request, url }) => {
    let requestBody: UpdateMemberPermissionsRequestBody;
    try {
        requestBody = await request.json() as UpdateMemberPermissionsRequestBody;
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

    const permissions = normalizePermissions(requestBody.permissions);

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
        return new Response(JSON.stringify({ message: "You've no permission to update member permissions" }), {
            status: 401,
            headers: { "content-type": "application/json" }
        });
    }

    const workspaceSubscription = await getWorkspaceActiveSubscription(workspaceId);
    if (!workspaceSubscription.hasActiveSubscription) {
        return new Response(
            JSON.stringify({ message: "Cannot update member permissions because this workspace has no active subscription" }),
            {
                status: 401,
                headers: { "content-type": "application/json" }
            }
        );
    }

    const memberToUpdate = workspace.workspaceMembers.find(member => member.user.id === userId);
    if (!memberToUpdate) {
        return new Response(JSON.stringify({ message: "Following user is not a member of this workspace" }), {
            status: 404,
            headers: { "content-type": "application/json" }
        });
    }

    if (memberToUpdate.user.id === workspace.ownerUserId && memberToUpdate.user.id !== authenticationResponse.data.user.id) {
        return new Response(JSON.stringify({ message: "You cannot update the permission of workspace owner" }), {
            status: 401,
            headers: { "content-type": "application/json" }
        });
    }
    else if (memberToUpdate.permissions.includes("manage_workspace_members") && memberToUpdate.user.id !== currentUserId) {
        return new Response(JSON.stringify({ message: "You cannot manage member permissions has same management permission as you" }), { status: 403 });
    }

    const userProfile = await DB_Models.UserAccount.profileModel
        .findOne({ id: userId })
        .select({ _id: 1 })
        .lean<{ _id?: unknown }>();

    if (!userProfile?._id) {
        return new Response(JSON.stringify({ message: "Following user profile was not found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
        });
    }

    const updateResult = await DB_Models.Workspace.Workspace.workspaceModel.updateOne(
        {
            id: workspaceId,
            "workspaceMembers.user": userProfile._id
        },
        {
            $set: {
                "workspaceMembers.$.permissions": permissions
            }
        }
    );

    if (!updateResult.modifiedCount && !updateResult.matchedCount) {
        return new Response(JSON.stringify({ message: "Cannot update member permissions" }), {
            status: 500,
            headers: { "content-type": "application/json" }
        });
    }

    return new Response(JSON.stringify({ ok: true, updated: true, permissions }), {
        status: 200,
        headers: { "content-type": "application/json" }
    });
};
