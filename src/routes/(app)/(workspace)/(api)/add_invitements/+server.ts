import { downloadCurrentUser } from "$lib/utils/auth";
import { DB_Models } from "@ravenlens/backend";
import { randomUUID } from "node:crypto";
import { extractBearerToken } from "$lib/server/auth/request";
import { prefetchWorkspaceWithMembers } from "$lib/server/db";
import { getWorkspaceActiveSubscription } from "$lib/server/subscription";
import { getWorkspaceMembersLimit } from "$lib/subscription/limits";
import { Permissions, type Workspace } from "@ravenlens/shared";
import type { RequestHandler } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { getResendInstance } from "$lib/server/email";
import { appName } from "$lib/config/app";

type WorkspacePermission = Permissions.Workspace.WorkspaceUserPermissions;

type ExistingProfileCandidate = {
    _id?: unknown;
    id?: unknown;
    email?: unknown;
};

type WorkspaceInvitement = Workspace.Workspace.WorkspaceMemberInvitement<Workspace.Workspace.InvitementKind>;

type ExistingWorkspaceMember = {
    user: {
        id?: unknown;
        email?: unknown;
        githubAccountProperties?: {
            githubUserId?: unknown;
        } | null;
    };
};

type ExistingWorkspaceIdentity = {
    invitedEmails: Set<string>;
    invitedExternalUserIds: Set<string>;
    memberEmails: Set<string>;
    memberUserIds: Set<string>;
    memberGithubIds: Set<string>;
};

type ExistingProfileRecord = {
    _id: unknown;
    id: string;
    email: string;
};

type MemberToJoin = {
    user: unknown;
    permissions: WorkspacePermission[];
    joinDate: Date;
};

type PreparedIncomingInvitements =
    | {
        ok: true;
        invitements: WorkspaceInvitement[];
    }
    | {
        ok: false;
        response: Response;
    };

type SplitInvitementsParams = {
    invitements: WorkspaceInvitement[];
    existingProfilesByEmail: Map<string, ExistingProfileRecord>;
    existingMemberIds: Set<string>;
    ownerUserId: string;
    existingInvitedEmails: Set<string>;
    existingInvitedExternalUserIds: Set<string>;
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

function normalizeEmailAddress(value: unknown): string | undefined {
    const email = asNonEmptyString(value);
    return email ? email.toLowerCase() : undefined;
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

function mergePermissions(
    previousPermissions: WorkspacePermission[],
    nextPermissions: WorkspacePermission[]
): WorkspacePermission[] {
    return [...new Set<WorkspacePermission>([...previousPermissions, ...nextPermissions])];
}

function dedupeWorkspaceInvitements(
    invitations: WorkspaceInvitement[]
): WorkspaceInvitement[] {
    const dedupedInvitations: WorkspaceInvitement[] = [];
    const seenEmails = new Set<string>();
    const seenExternalUserIds = new Set<string>();

    for (const invitation of invitations) {
        const invitationEmail = normalizeEmailAddress(invitation.user.email);
        const invitationExternalUserId = asNonEmptyString(invitation.user.id);
        const isDuplicate = Boolean(
            (invitationEmail && seenEmails.has(invitationEmail))
            || (invitationExternalUserId && seenExternalUserIds.has(invitationExternalUserId))
        );

        if (isDuplicate) {
            continue;
        }

        if (invitationEmail) {
            seenEmails.add(invitationEmail);
        }

        if (invitationExternalUserId) {
            seenExternalUserIds.add(invitationExternalUserId);
        }

        dedupedInvitations.push(invitation);
    }

    return dedupedInvitations;
}

function getInvitationEmailCandidate(invitement: WorkspaceInvitement): unknown {
    const fallbackEmailFromName = typeof invitement.user.name === "string" && invitement.user.name.includes("@")
        ? invitement.user.name
        : undefined;

    return invitement.user.email ?? fallbackEmailFromName;
}

function buildExistingWorkspaceIdentity(
    workspaceInvitementsFromDb: WorkspaceInvitement[],
    workspaceMembers: ExistingWorkspaceMember[]
): ExistingWorkspaceIdentity {
    const invitedEmails = new Set<string>();
    const invitedExternalUserIds = new Set<string>();

    for (const existingInvitation of workspaceInvitementsFromDb) {
        const invitationEmail = normalizeEmailAddress(existingInvitation.user.email);
        const invitationExternalUserId = asNonEmptyString(existingInvitation.user.id);

        if (invitationEmail) {
            invitedEmails.add(invitationEmail);
        }

        if (invitationExternalUserId) {
            invitedExternalUserIds.add(invitationExternalUserId);
        }
    }

    const memberEmails = new Set<string>();
    const memberUserIds = new Set<string>();
    const memberGithubIds = new Set<string>();

    for (const workspaceMember of workspaceMembers) {
        const memberEmail = normalizeEmailAddress(workspaceMember.user.email);
        const memberUserId = asNonEmptyString(workspaceMember.user.id);
        const memberGithubId = asNonEmptyString(workspaceMember.user.githubAccountProperties?.githubUserId?.toString());

        if (memberEmail) {
            memberEmails.add(memberEmail);
        }

        if (memberUserId) {
            memberUserIds.add(memberUserId);
        }

        if (memberGithubId) {
            memberGithubIds.add(memberGithubId);
        }
    }

    return {
        invitedEmails,
        invitedExternalUserIds,
        memberEmails,
        memberUserIds,
        memberGithubIds
    };
}

function prepareIncomingInvitements(
    requestedInvitements: WorkspaceInvitement[],
    existingWorkspaceIdentity: ExistingWorkspaceIdentity
): PreparedIncomingInvitements {
    const uniqueMembers: WorkspaceInvitement[] = [];
    const seenRequestEmails = new Set<string>();
    const seenRequestExternalUserIds = new Set<string>();

    for (const invitementMember of requestedInvitements) {
        const preEmail = getInvitationEmailCandidate(invitementMember);
        if (!preEmail) {
            return {
                ok: false,
                response: new Response(JSON.stringify({ message: "Email isn't specified in request payload body" }), {
                    status: 400
                })
            };
        }

        const email = normalizeEmailAddress(preEmail);
        if (!email) {
            continue;
        }

        const invitedExternalUserId = asNonEmptyString(invitementMember.user.id);
        const isAlreadyInvitedByEmail = existingWorkspaceIdentity.invitedEmails.has(email);
        const isAlreadyInvitedByExternalId = Boolean(
            invitedExternalUserId
            && existingWorkspaceIdentity.invitedExternalUserIds.has(invitedExternalUserId)
        );
        const isAlreadyMemberByEmail = existingWorkspaceIdentity.memberEmails.has(email);
        const isAlreadyMemberByGithubId = Boolean(
            invitedExternalUserId
            && existingWorkspaceIdentity.memberGithubIds.has(invitedExternalUserId)
        );
        const isAlreadyMemberByUserId = Boolean(
            invitedExternalUserId
            && existingWorkspaceIdentity.memberUserIds.has(invitedExternalUserId)
        );
        const isDuplicateInRequest = seenRequestEmails.has(email)
            || Boolean(invitedExternalUserId && seenRequestExternalUserIds.has(invitedExternalUserId));

        if (
            isAlreadyInvitedByEmail
            || isAlreadyInvitedByExternalId
            || isAlreadyMemberByEmail
            || isAlreadyMemberByGithubId
            || isAlreadyMemberByUserId
            || isDuplicateInRequest
        ) {
            continue;
        }

        seenRequestEmails.add(email);
        if (invitedExternalUserId) {
            seenRequestExternalUserIds.add(invitedExternalUserId);
        }

        if (invitementMember.kind !== "email" && invitementMember.kind !== "github") {
            continue;
        }

        uniqueMembers.push({
            ...invitementMember,
            user: {
                ...invitementMember.user,
                email
            }
        });
    }

    return {
        ok: true,
        invitements: uniqueMembers
    };
}

function collectInvitedEmails(invitements: WorkspaceInvitement[]): string[] {
    return [...new Set(
        invitements
            .map(member => normalizeEmailAddress(member.user.email))
            .filter((email): email is string => Boolean(email))
    )];
}

async function findExistingProfilesByEmail(invitedEmails: string[]): Promise<Map<string, ExistingProfileRecord>> {
    const existingProfilesByEmail = new Map<string, ExistingProfileRecord>();

    if (!invitedEmails.length) {
        return existingProfilesByEmail;
    }

    const existingProfiles = await DB_Models.UserAccount.profileModel
        .find({
            $or: invitedEmails.map(email => ({
                email: {
                    $regex: `^${escapeRegExp(email)}$`,
                    $options: "i"
                }
            }))
        })
        .select({ _id: 1, id: 1, email: 1 })
        .lean<ExistingProfileCandidate[]>();

    for (const profile of existingProfiles) {
        const profileId = asNonEmptyString(profile.id);
        const profileEmail = normalizeEmailAddress(profile.email);
        if (!profile._id || !profileId || !profileEmail) {
            continue;
        }

        existingProfilesByEmail.set(profileEmail, {
            _id: profile._id,
            id: profileId,
            email: profileEmail
        });
    }

    return existingProfilesByEmail;
}

function splitInvitementsForPersistence({
    invitements,
    existingProfilesByEmail,
    existingMemberIds,
    ownerUserId,
    existingInvitedEmails,
    existingInvitedExternalUserIds
}: SplitInvitementsParams): {
    invitationsToPersist: WorkspaceInvitement[];
    membersToJoin: MemberToJoin[];
} {
    const membersToJoinByUserId = new Map<string, MemberToJoin>();
    const invitationsToPersist: WorkspaceInvitement[] = [];
    const invitationEmailsQueuedForPersistence = new Set(existingInvitedEmails);
    const invitationExternalIdsQueuedForPersistence = new Set(existingInvitedExternalUserIds);

    for (const invitedMember of invitements) {
        const invitedEmail = normalizeEmailAddress(invitedMember.user.email);
        const invitedExternalUserId = asNonEmptyString(invitedMember.user.id);
        const existingProfile = invitedEmail ? existingProfilesByEmail.get(invitedEmail) : undefined;

        if (existingProfile) {
            if (!existingMemberIds.has(existingProfile.id) && ownerUserId !== existingProfile.id) {
                const existingMemberToJoin = membersToJoinByUserId.get(existingProfile.id);
                const invitedPermissions = normalizePermissions(invitedMember.withPermissions);

                if (existingMemberToJoin) {
                    existingMemberToJoin.permissions = mergePermissions(existingMemberToJoin.permissions, invitedPermissions);
                } else {
                    membersToJoinByUserId.set(existingProfile.id, {
                        user: existingProfile._id,
                        permissions: invitedPermissions,
                        joinDate: new Date()
                    });
                }
            }

            continue;
        }

        if (!invitedEmail) {
            continue;
        }

        const duplicatesPersistedInvitation = invitationEmailsQueuedForPersistence.has(invitedEmail)
            || Boolean(
                invitedExternalUserId
                && invitationExternalIdsQueuedForPersistence.has(invitedExternalUserId)
            );

        if (duplicatesPersistedInvitation) {
            continue;
        }

        invitationEmailsQueuedForPersistence.add(invitedEmail);
        if (invitedExternalUserId) {
            invitationExternalIdsQueuedForPersistence.add(invitedExternalUserId);
        }

        invitationsToPersist.push({
            ...invitedMember,
            id: invitedMember.id || `invitement-${randomUUID()}`,
            invitedOn: invitedMember.invitedOn || new Date()
        });
    }

    return {
        invitationsToPersist,
        membersToJoin: [...membersToJoinByUserId.values()]
    };
}

async function sendInvitementEmail(invitedMembers: WorkspaceInvitement[]) {
    const resendFromEmail = env.RESEND_FROM_EMAIL?.trim();
    const resend = getResendInstance();

    for (const member of invitedMembers) {
        const preEmail = getInvitationEmailCandidate(member);
        
        if (typeof preEmail === "string" && preEmail) {
            const { error } = await resend.emails.send({
                from: resendFromEmail,
                to: [preEmail],
                subject: `You're invited to join ${appName}`,
                html: `
                    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
                        <h2 style="margin: 0 0 12px;">You were invited to ${appName}</h2>
                        <p style="margin: 0 0 12px;">A workspace member has invited you to collaborate in ${appName}.</p>
                        <p style="margin: 0 0 12px;">Sign in to your account and open workspace invitations to accept or decline this invitation.</p>
                        <p style="margin: 0; color: #475569;">If you were not expecting this invitation, you can safely ignore this email.</p>
                    </div>
                `,
                text: `You were invited to ${appName}. Sign in and open workspace invitations to accept or decline this invitation. If you were not expecting this invitation, you can ignore this email.`
            });
        
            if (error) {
                throw new Error(error.message || "Failed to send invitation email");
            }
        }
    }
}

/**
 * Workspace member invitements
*/
export const POST: RequestHandler = async ({ request, url }) => {
    const { workspaceId, workspaceInvitements } = await request.json() as {
        workspaceId: string;
        workspaceInvitements: Workspace.Workspace.WorkspaceMemberInvitement<Workspace.Workspace.InvitementKind>[]
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
    
    // 2. Check is user member of workspace with `workspaceId`
    if (!thisUserAWorkspaceMember) {
        return new Response(JSON.stringify({ message: "You're not workspace member" }), {
            status: 401
        })
    }

    // 3. Check has user adequate permissions in workspace to invite new members
    if (!thisUserAWorkspaceMember.permissions.includes("manage_workspace_members") && userWorkspacesQuota.ownerUserId !== authenticationResponse.data.user.id) {
        return new Response(JSON.stringify({ message: "You've not permission to invite new members to workspace" }), {
            status: 401
        })
    }

    const workspaceSubscription = await getWorkspaceActiveSubscription(workspaceId);
    if (!workspaceSubscription.hasActiveSubscription) {
        return new Response(
            JSON.stringify({ message: "Cannot invite new members because this workspace has no active subscription" }),
            {
                status: 401,
                headers: { "content-type": "application/json" }
            }
        );
    }

    const subscriptionKind = workspaceSubscription.subscriptionKind ?? "growth";
    const maxWorkspaceMembers = getWorkspaceMembersLimit(subscriptionKind);

    const workspaceInvitementsFromDb: WorkspaceInvitement[] = Array.isArray(userWorkspacesQuota.workspaceInvitements)
        ? userWorkspacesQuota.workspaceInvitements
        : [];

    const existingWorkspaceIdentity = buildExistingWorkspaceIdentity(
        workspaceInvitementsFromDb,
        userWorkspacesQuota.workspaceMembers
    );

    const preparedIncomingInvitements = prepareIncomingInvitements(
        workspaceInvitements,
        existingWorkspaceIdentity
    );

    if (!preparedIncomingInvitements.ok) {
        return preparedIncomingInvitements.response;
    }

    const uniqueMembers = preparedIncomingInvitements.invitements;

    if (uniqueMembers.length > 0) {
        const invitedEmails = collectInvitedEmails(uniqueMembers);
        const existingProfilesByEmail = await findExistingProfilesByEmail(invitedEmails);

        const existingMemberIds = new Set(userWorkspacesQuota.workspaceMembers.map(member => member.user.id));
        const { invitationsToPersist, membersToJoin } = splitInvitementsForPersistence({
            invitements: uniqueMembers,
            existingProfilesByEmail,
            existingMemberIds,
            ownerUserId: userWorkspacesQuota.ownerUserId,
            existingInvitedEmails: existingWorkspaceIdentity.invitedEmails,
            existingInvitedExternalUserIds: existingWorkspaceIdentity.invitedExternalUserIds
        });

        if (typeof maxWorkspaceMembers === "number") {
            const currentWorkspaceSeats = userWorkspacesQuota.workspaceMembers.length + workspaceInvitementsFromDb.length;
            const nextWorkspaceSeats = currentWorkspaceSeats + invitationsToPersist.length + membersToJoin.length;

            if (nextWorkspaceSeats > maxWorkspaceMembers) {
                return new Response(
                    JSON.stringify({
                        message: `This workspace reached the ${maxWorkspaceMembers}-member limit for the ${subscriptionKind} plan. Upgrade your plan to invite more members.`
                    }),
                    {
                        status: 402,
                        headers: { "content-type": "application/json" }
                    }
                );
            }
        }

        if (invitationsToPersist.length > 0) {
            // Send email only for invitations that will actually be stored.
            await sendInvitementEmail(invitationsToPersist);
        }

        if (invitationsToPersist.length > 0 || membersToJoin.length > 0) {
            const workspaceInvitementsToPersist = dedupeWorkspaceInvitements([
                ...workspaceInvitementsFromDb,
                ...invitationsToPersist
            ]);

            const updateOperation: {
                $set: {
                    workspaceInvitements: typeof workspaceInvitementsToPersist;
                };
                $push?: {
                    workspaceMembers: {
                        $each: {
                            user: unknown;
                            permissions: WorkspacePermission[];
                            joinDate: Date;
                        }[];
                    };
                };
            } = {
                $set: {
                    workspaceInvitements: workspaceInvitementsToPersist
                }
            };

            if (membersToJoin.length > 0) {
                updateOperation.$push = {
                    workspaceMembers: {
                        $each: membersToJoin
                    }
                };
            }

            await DB_Models.Workspace.Workspace.workspaceModel.findOneAndUpdate(
                {
                    id: workspaceId
                },
                updateOperation
            );
        }
    }
    else return new Response(JSON.stringify({ message: "All members are already in workspace!" }), { status: 403 });


    return new Response(null, {
        status: 200
    });
}
