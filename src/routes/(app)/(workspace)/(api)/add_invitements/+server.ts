import { downloadCurrentUser } from "$lib/utils/auth";
import { DB_Models } from "@ravenlens/backend";
import { randomUUID } from "node:crypto";
import { extractBearerToken } from "$lib/server/auth/request";
import { prefetchWorkspaceWithMembers } from "$lib/server/db";
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

async function sendInvitementEmail(invitedMembers: Workspace.Workspace.WorkspaceMemberInvitement<Workspace.Workspace.InvitementKind>[]) {
    const resendFromEmail = env.RESEND_FROM_EMAIL?.trim();
    const resend = getResendInstance();

    for (const member of invitedMembers) {
        if (member.kind === "email" && member.user.email) {
            const { error } = await resend.emails.send({
                from: resendFromEmail,
                to: [member.user.email],
                subject: `You're invited to join ${appName}`,
                // TODO: Add domain name
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
 * 1. Check is user authenticated member (done)
 * 2. Check is user member of workspace with `workspaceId` (done)
 * 3. Check has user adequate permissions in workspace to invite new members (done)
 * 4. Add members to workspace (done)
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

    const workspaceInvitementsFromDb = Array.isArray(userWorkspacesQuota.workspaceInvitements)
        ? userWorkspacesQuota.workspaceInvitements
        : [];

    // 4. Add members to workspace for these members doesn't already exists in workspace
    // User can add add freely all permissions since user is permitted to 'manage workspace members'
    const uniqueMembers: Workspace.Workspace.WorkspaceMemberInvitement<Workspace.Workspace.InvitementKind>[] = [];
    const seenInvitementKeys = new Set<string>();

    for (const invitementMember of workspaceInvitements) {
        // 1. use github / linkedin api to fetch user with such id
        // 2. or: use email and insert in invitements
        // 3. Base on user id / email check is user already a member and when isn't paste to invitement

        /** Email always will be specified for each of invitement method */
        const email = normalizeEmailAddress(invitementMember.user.email);
        if (!email) {
            continue;
        }

        const invitedExternalUserId = asNonEmptyString(invitementMember.user.id);
        const invitementDedupeKey = `${invitementMember.kind}|${email}|${invitedExternalUserId ?? ""}`;
        if (seenInvitementKeys.has(invitementDedupeKey)) {
            continue;
        }

        seenInvitementKeys.add(invitementDedupeKey);

        const isAlreadyInvitedByEmail = workspaceInvitementsFromDb.some(
            inv => normalizeEmailAddress(inv.user.email) === email
        );

        const isAlreadyMemberByEmail = userWorkspacesQuota.workspaceMembers.some(
            member => normalizeEmailAddress(member.user.email) === email
        );

        const part3rdProviderIsWorkspaceInvitementNonRepeated = () => !workspaceInvitementsFromDb.some(inv => {
            const sameEmail = normalizeEmailAddress(inv.user.email) === email;
            const sameExternalId = Boolean(invitedExternalUserId && inv.user.id === invitedExternalUserId);

            return sameEmail || sameExternalId;
        });

        // 2 forms of invitements are avaiable now
        switch(invitementMember.kind) {
            case 'email': {
                if (!isAlreadyMemberByEmail && !isAlreadyInvitedByEmail) {
                    uniqueMembers.push(invitementMember);
                }

                break;
            }

            case 'github': {
                const isAlreadyMemberByGithubId = Boolean(
                    invitedExternalUserId
                    && userWorkspacesQuota.workspaceMembers.some(
                        member => member.user.githubAccountProperties?.githubUserId?.toString() === invitedExternalUserId
                    )
                );

                if (!isAlreadyMemberByEmail && !isAlreadyMemberByGithubId && part3rdProviderIsWorkspaceInvitementNonRepeated()) {
                    uniqueMembers.push(invitementMember);
                }

                break;
            }

            default:
                break;
        }
    }

    if (uniqueMembers.length > 0) {
        // Send email to each invited member
        await sendInvitementEmail(uniqueMembers);

        const invitedEmails = [...new Set(
            uniqueMembers
                .map(member => normalizeEmailAddress(member.user.email))
                .filter((email): email is string => Boolean(email))
        )];

        const existingProfilesByEmail = new Map<string, { _id: unknown; id: string; email: string }>();
        if (invitedEmails.length) {
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
        }

        const existingMemberIds = new Set(userWorkspacesQuota.workspaceMembers.map(member => member.user.id));
        const membersToJoinByUserId = new Map<string, {
            user: unknown;
            permissions: WorkspacePermission[];
            joinDate: Date;
        }>();
        const invitationsToPersist: Workspace.Workspace.WorkspaceMemberInvitement<Workspace.Workspace.InvitementKind>[] = [];

        for (const invitedMember of uniqueMembers) {
            const invitedEmail = normalizeEmailAddress(invitedMember.user.email);
            const existingProfile = invitedEmail ? existingProfilesByEmail.get(invitedEmail) : undefined;

            if (existingProfile) {
                if (!existingMemberIds.has(existingProfile.id) && userWorkspacesQuota.ownerUserId !== existingProfile.id) {
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

            invitationsToPersist.push({
                ...invitedMember,
                id: invitedMember.id || `invitement-${randomUUID()}`,
                invitedOn: invitedMember.invitedOn || new Date()
            });
        }

        const membersToJoin = [...membersToJoinByUserId.values()];

        if (invitationsToPersist.length > 0 || membersToJoin.length > 0) {
            workspaceInvitementsFromDb.push(...invitationsToPersist);

            const updateOperation: {
                $set: {
                    workspaceInvitements: typeof workspaceInvitementsFromDb;
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
                    workspaceInvitements: workspaceInvitementsFromDb
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

    return new Response(JSON.stringify({ message: "Invitements processed successfully", addedCount: uniqueMembers.length }), {
        status: 200
    });
}
