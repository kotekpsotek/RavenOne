import { DB_Models } from "@ravenlens/backend";
import { Permissions } from "@ravenlens/shared";

type WorkspacePermission = Permissions.Workspace.WorkspaceUserPermissions;

type WorkspaceInvitementRaw = {
    user?: {
        email?: unknown;
    };
    withPermissions?: unknown;
};

type WorkspaceMemberRaw = {
    user?: unknown;
};

type WorkspaceDocumentRaw = {
    id?: unknown;
    ownerUserId?: unknown;
    workspaceMembers?: WorkspaceMemberRaw[];
    workspaceInvitements?: WorkspaceInvitementRaw[];
};

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

function normalizeEmail(value: unknown): string | undefined {
    const email = asNonEmptyString(value);
    return email ? email.toLowerCase() : undefined;
}

function normalizeObjectId(value: unknown): string | undefined {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
    }

    if (
        value
        && typeof value === "object"
        && "toString" in value
        && typeof (value as { toString: () => string }).toString === "function"
    ) {
        const normalized = (value as { toString: () => string }).toString().trim();
        return normalized.length ? normalized : undefined;
    }

    return undefined;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

export type AutoJoinUserToInvitedWorkspacesInput = {
    userId: string;
    userObjectId: unknown;
    email?: string | null;
};

export type AutoJoinUserToInvitedWorkspacesResult = {
    joinedWorkspaceIds: string[];
    joinedCount: number;
    consumedInvitationCount: number;
};

export async function autoJoinUserToInvitedWorkspaces(
    input: AutoJoinUserToInvitedWorkspacesInput
): Promise<AutoJoinUserToInvitedWorkspacesResult> {
    const normalizedUserId = asNonEmptyString(input.userId);
    const normalizedEmail = normalizeEmail(input.email);
    const userObjectId = input.userObjectId;
    const userObjectIdString = normalizeObjectId(userObjectId);

    if (!normalizedUserId || !normalizedEmail || !userObjectIdString || userObjectId === undefined || userObjectId === null) {
        return {
            joinedWorkspaceIds: [],
            joinedCount: 0,
            consumedInvitationCount: 0
        };
    }

    const escapedEmail = escapeRegExp(normalizedEmail);
    const candidateWorkspaces = await DB_Models.Workspace.Workspace.workspaceModel
        .find({
            "workspaceInvitements.user.email": {
                $regex: `^${escapedEmail}$`,
                $options: "i"
            }
        })
        .select({
            id: 1,
            ownerUserId: 1,
            workspaceMembers: 1,
            workspaceInvitements: 1
        })
        .lean<WorkspaceDocumentRaw[]>();

    const joinedWorkspaceIds: string[] = [];
    let consumedInvitationCount = 0;

    for (const workspace of candidateWorkspaces) {
        const workspaceId = asNonEmptyString(workspace.id);
        if (!workspaceId) {
            continue;
        }

        const workspaceInvitements = Array.isArray(workspace.workspaceInvitements)
            ? workspace.workspaceInvitements
            : [];

        if (!workspaceInvitements.length) {
            continue;
        }

        const matchedInvitements: WorkspaceInvitementRaw[] = [];
        const remainingInvitements: WorkspaceInvitementRaw[] = [];

        for (const invitation of workspaceInvitements) {
            const invitationEmail = normalizeEmail(invitation.user?.email);
            if (invitationEmail === normalizedEmail) {
                matchedInvitements.push(invitation);
                continue;
            }

            remainingInvitements.push(invitation);
        }

        if (!matchedInvitements.length) {
            continue;
        }

        consumedInvitationCount += matchedInvitements.length;

        const permissionsToAssign = new Set<WorkspacePermission>();
        for (const matchedInvitation of matchedInvitements) {
            for (const permission of normalizePermissions(matchedInvitation.withPermissions)) {
                permissionsToAssign.add(permission);
            }
        }

        const ownerUserId = asNonEmptyString(workspace.ownerUserId);
        const memberAlreadyExists = ownerUserId === normalizedUserId
            || (Array.isArray(workspace.workspaceMembers)
                && workspace.workspaceMembers.some(member => normalizeObjectId(member.user) === userObjectIdString));

        const updateOperation: {
            $set: {
                workspaceInvitements: WorkspaceInvitementRaw[];
            };
            $push?: {
                workspaceMembers: {
                    user: unknown;
                    permissions: WorkspacePermission[];
                    joinDate: Date;
                };
            };
        } = {
            $set: {
                workspaceInvitements: remainingInvitements
            }
        };

        if (!memberAlreadyExists) {
            updateOperation.$push = {
                workspaceMembers: {
                    user: userObjectId,
                    permissions: [...permissionsToAssign],
                    joinDate: new Date()
                }
            };

            joinedWorkspaceIds.push(workspaceId);
        }

        await DB_Models.Workspace.Workspace.workspaceModel.updateOne(
            { id: workspaceId },
            updateOperation
        );
    }

    return {
        joinedWorkspaceIds,
        joinedCount: joinedWorkspaceIds.length,
        consumedInvitationCount
    };
}
