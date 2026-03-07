import { downloadCurrentUser } from "$lib/utils/auth";
import { DB_Models } from "@ravenlens/backend";
import { randomUUID } from "node:crypto";
import { extractBearerToken } from "$lib/server/auth/request";
import { prefetchWorkspaceWithMembers } from "$lib/server/db";
import type { Workspace } from "@ravenlens/shared";
import type { RequestHandler } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { getResendInstance } from "$lib/server/email";
import { appName } from "$lib/config/app";

async function sendInvitementEmail(invitedMembers: Workspace.Workspace.WorkspaceMemberInvitement<Workspace.Workspace.InvitementKind>[]) {
    const resendFromEmail = env.RESEND_FROM_EMAIL?.trim();
    const resend = getResendInstance();
    console.log(invitedMembers)

    for (const member of invitedMembers) {
        console.log(member.user.email)
        if (member.kind === "email" && member.user.email) {
            console.log('Send')
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

    // 4. Add members to workspace for these members doesn't already exists in workspace
    // User can add add freely all permissions since user is permitted to 'manage workspace members'
    const uniqueMembers = workspaceInvitements.filter(invitementMember => {
        // 1. use github / linkedin api to fetch user with such id
        // 2. or: use email and insert in invitements
        // 3. Base on user id / email check is user already a member and when isn't paste to invitement

        /** Email always will be specified for each of invitement method */
        const email = invitementMember.user.email;

        const part3rdProviderIsWorkspaceInvitementNonRepeated = () => !userWorkspacesQuota.workspaceInvitements.some(inv => inv.user.email === email || (inv.user.id === invitementMember.user.id || inv.user.email === invitementMember.user.email))

        // 2 forms of invitements are avaiable now
        switch(invitementMember.kind) {
            case 'email': {
                return !userWorkspacesQuota.workspaceMembers.some(member => member.user.email === email) &&
                       !userWorkspacesQuota.workspaceInvitements.some(inv => inv.user.email === email);
            }

            case 'github': {
                return !userWorkspacesQuota.workspaceMembers.some(member => member.user.email === email || member.user.githubAccountProperties?.githubUserId.toString() === invitementMember.user.id) &&
                    part3rdProviderIsWorkspaceInvitementNonRepeated();
            }
            
            default:
                return false;
        }
    });

    console.log('UQ', uniqueMembers)
    if (uniqueMembers.length > 0) {
        // Send email to each invited member
        await sendInvitementEmail(uniqueMembers);

        // Add Workspace members
        userWorkspacesQuota.workspaceInvitements.push(...uniqueMembers.map(member => ({
            ...member,
            id: member.id || `invitement-${randomUUID()}`,
            invitedOn: member.invitedOn || new Date()
        })));

        // Updates workspaceInvitements
        await DB_Models.Workspace.Workspace.workspaceModel.findOneAndUpdate(
            {
                id: workspaceId
            },
            {
                $set: {
                    workspaceInvitements: userWorkspacesQuota.workspaceInvitements
                }
            }
        );
    }

    return new Response(JSON.stringify({ message: "Invitements processed successfully", addedCount: uniqueMembers.length }), {
        status: 200
    });
}
