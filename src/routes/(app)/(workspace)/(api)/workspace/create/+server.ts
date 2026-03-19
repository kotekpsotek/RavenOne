import { randomUUID } from "node:crypto";
import { ensureAuthenticatedViaRoute, getAuthenticatedPayload } from "$lib/server/auth/request";
import { getUserActiveSubscription } from "$lib/server/subscription";
import { getWorkspaceMembersLimit, getWorkspaceOwnershipLimit } from "$lib/subscription/limits";
import { DB_Models } from "@ravenlens/backend";
import { Permissions, Workspace } from "@ravenlens/shared";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { downloadCurrentUser } from "$lib/utils/auth";
import { extractBearerToken } from "$lib/server/auth/request";

type WorkspaceEntry = Workspace.Workspace.WorkspaceUserEntryLoaded;
type WorkspacePermission = WorkspaceEntry["userPermissions"][number];
type WorkspaceInvitement = Workspace.Workspace.WorkspaceMemberInvitement;

type CreateWorkspaceRequestBody = {
	workspaceName?: unknown;
	workspaceInvitements?: unknown;
};

type UserProfileProjection = {
	name?: unknown;
	profileImgURL?: unknown;
};

type NormalizeInvitementContext = {
	invitedBy: WorkspaceInvitement["invitedBy"];
	now: Date;
};

const MAX_WORKSPACE_NAME_LENGTH = 128;
const WORKSPACE_INVITEMENT_KINDS = new Set<Workspace.Workspace.InvitementKind>([
	"email",
	"github",
	"linkedin",
	"goolge"
]);

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	try {
		return JSON.stringify(error);
	} catch {
		return "Unknown error";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length ? trimmed : undefined;
}

function isValidEmail(emailCandidate: string): boolean {
	return /^[^\s@]+@[^\s@]+$/.test(emailCandidate);
}

function normalizeWorkspaceName(workspaceNameCandidate: unknown): string | undefined {
	const workspaceName = asNonEmptyString(workspaceNameCandidate);
	if (!workspaceName) {
		return undefined;
	}

	if (workspaceName.length > MAX_WORKSPACE_NAME_LENGTH) {
		return undefined;
	}

	return workspaceName;
}

function buildDefaultWorkspaceImageUrl(workspaceName: string, workspaceId: string): string {
	const seed = encodeURIComponent(`${workspaceName}-${workspaceId.slice(0, 8)}`);
	return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}`;
}

function allWorkspacePermissions(): WorkspacePermission[] {
	return Object.keys(Permissions.Workspace.worspacePermissionLeaderBoardAndNames) as WorkspacePermission[];
}

function normalizeInvitementPermissions(input: unknown): WorkspacePermission[] {
	if (!Array.isArray(input)) {
		return [];
	}

	const allowedPermissions = new Set(allWorkspacePermissions());
	const uniquePermissions = new Set<WorkspacePermission>();

	for (const candidatePermission of input) {
		if (typeof candidatePermission !== "string") {
			continue;
		}

		if (allowedPermissions.has(candidatePermission as WorkspacePermission)) {
			uniquePermissions.add(candidatePermission as WorkspacePermission);
		}
	}

	return [...uniquePermissions];
}

function normalizeInvitement(
	invitementCandidate: unknown,
	context: NormalizeInvitementContext
): WorkspaceInvitement | undefined {
	if (!isRecord(invitementCandidate)) {
		return undefined;
	}

	const userCandidate = invitementCandidate.user;
	if (!isRecord(userCandidate)) {
		return undefined;
	}

	const userName = asNonEmptyString(userCandidate.name);
	if (!userName) {
		return undefined;
	}

	const emailFromPayload = asNonEmptyString(userCandidate.email);
	const userId = asNonEmptyString(userCandidate.id);
	const profileImgURL = asNonEmptyString(userCandidate.profileImgURL);

	const kindCandidate = asNonEmptyString(invitementCandidate.kind);
	const normalizedKind =
		kindCandidate && WORKSPACE_INVITEMENT_KINDS.has(kindCandidate as Workspace.Workspace.InvitementKind)
			? (kindCandidate as Workspace.Workspace.InvitementKind)
			: "email";

	const normalizedEmail =
		emailFromPayload ?? (normalizedKind === "email" && isValidEmail(userName) ? userName : undefined);

	const normalizedInvitement: WorkspaceInvitement = {
		id: asNonEmptyString(invitementCandidate.id) ?? randomUUID(),
		user: {
			name: userName,
			...(normalizedEmail ? { email: normalizedEmail } : {}),
			...(userId ? { id: userId } : {}),
			...(profileImgURL ? { profileImgURL } : {})
		},
		kind: normalizedKind,
		withPermissions: normalizeInvitementPermissions(invitementCandidate.withPermissions),
		// Always set server-side author and time to prevent spoofing.
		invitedBy: context.invitedBy,
		invitedOn: context.now
	};

	return normalizedInvitement;
}

function normalizeWorkspaceInvitements(
	workspaceInvitementsCandidate: unknown,
	context: NormalizeInvitementContext
): WorkspaceInvitement[] {
	if (!Array.isArray(workspaceInvitementsCandidate)) {
		return [];
	}

	const uniqueInvitements = new Map<string, WorkspaceInvitement>();

	for (const invitementCandidate of workspaceInvitementsCandidate) {
		const normalizedInvitement = normalizeInvitement(invitementCandidate, context);
		if (!normalizedInvitement) {
			continue;
		}

		const uniquenessKey = [
			normalizedInvitement.kind,
			normalizedInvitement.user.email ?? "",
			normalizedInvitement.user.id ?? "",
			normalizedInvitement.user.name
		].join("|");

		uniqueInvitements.set(uniquenessKey, normalizedInvitement);
	}

	return [...uniqueInvitements.values()];
}

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
	const authStatusResponse = await ensureAuthenticatedViaRoute(request, fetch);
	if (!authStatusResponse) {
		return json({ status: false, error: "Failed to validate authentication" }, { status: 500 });
	}

	if (!authStatusResponse.ok) {
		return json({ status: false, error: "Unauthorized" }, { status: 401 });
	}

	const payload = getAuthenticatedPayload(request, cookies);
	if (!payload) {
		return json({ status: false, error: "Invalid or expired token" }, { status: 401 });
	}

	const userSubscription = await getUserActiveSubscription(payload.userId);
	if (!userSubscription.hasActiveSubscription) {
		return json(
			{ status: false, error: "Cannot create workspace because your account has no active subscription" },
			{ status: 401 }
		);
	}

	const subscriptionKind = userSubscription.subscriptionKind ?? "growth";
	const maxOwnedWorkspaces = getWorkspaceOwnershipLimit(subscriptionKind);
	const maxWorkspaceMembers = getWorkspaceMembersLimit(subscriptionKind);

	let requestBody: CreateWorkspaceRequestBody;
	try {
		requestBody = (await request.json()) as CreateWorkspaceRequestBody;
	} catch {
		return json({ status: false, error: "Invalid request body" }, { status: 400 });
	}

	const workspaceName = normalizeWorkspaceName(requestBody.workspaceName);
	if (!workspaceName) {
		return json(
			{
				status: false,
				error: `Workspace name is required and cannot exceed ${MAX_WORKSPACE_NAME_LENGTH} characters`
			},
			{ status: 400 }
		);
	}

	try {
		const profileQuery: { id: string; email?: string } = { id: payload.userId };
		if (payload.email) {
			profileQuery.email = payload.email;
		}

		const currentUserProfile = await DB_Models.UserAccount.profileModel.findOne(profileQuery).lean();
		if (!currentUserProfile) {
			return json({ status: false, error: "User profile not found" }, { status: 404 });
		}

		const invitedBy: WorkspaceInvitement["invitedBy"] = {
			userId: payload.userId,
			userName: asNonEmptyString((currentUserProfile as UserProfileProjection).name) ?? "Unknown user",
			userProfileImgURL: asNonEmptyString((currentUserProfile as UserProfileProjection).profileImgURL) ?? ""
		};

		const now = new Date();
		const workspaceInvitements = normalizeWorkspaceInvitements(requestBody.workspaceInvitements, {
			invitedBy,
			now
		});

		if (typeof maxWorkspaceMembers === "number" && workspaceInvitements.length + 1 > maxWorkspaceMembers) {
			return json(
				{
					status: false,
					error: `Your ${subscriptionKind} plan allows up to ${maxWorkspaceMembers} workspace members. Remove some invitations or upgrade your plan.`,
					subscriptionKind,
					limit: maxWorkspaceMembers
				},
				{ status: 402 }
			);
		}

		if (typeof maxOwnedWorkspaces === "number") {
			const ownedWorkspacesCount = await DB_Models.Workspace.Workspace.workspaceModel.countDocuments({
				ownerUserId: payload.userId
			});

			if (ownedWorkspacesCount >= maxOwnedWorkspaces) {
				return json(
					{
						status: false,
						error: `Your ${subscriptionKind} plan allows up to ${maxOwnedWorkspaces} owned workspace${maxOwnedWorkspaces === 1 ? "" : "s"}. Upgrade your plan to create more workspaces.`,
						subscriptionKind,
						limit: maxOwnedWorkspaces
					},
					{ status: 402 }
				);
			}
		}

		const duplicateWorkspace = await DB_Models.Workspace.Workspace.workspaceModel
			.findOne({
				ownerUserId: payload.userId,
				name: workspaceName
			})
			.lean();

		if (duplicateWorkspace) {
			return json(
				{
					status: false,
					error: "Workspace with this name already exists"
				},
				{ status: 409 }
			);
		}

		const workspaceId = randomUUID();
		const imageUrl = buildDefaultWorkspaceImageUrl(workspaceName, workspaceId);
		
		await DB_Models.Workspace.Workspace.workspaceModel.create({
			id: workspaceId,
			name: workspaceName,
			imageUrl,
			ownerUserId: payload.userId,
			workspaceMembers: [
				{
					user: currentUserProfile._id,
					permissions: [],
				}
			],
			workspaceInvitements
		});

		const createdWorkspace: WorkspaceEntry = {
			id: workspaceId,
			name: workspaceName,
			imageUrl,
			ownerUserId: payload.userId,
			isOwner: true,
			userPermissions: allWorkspacePermissions()
		};

		return json(
			{
				status: true,
				message: "Workspace created successfully",
				workspace: createdWorkspace,
				avaiableWorkspaces: [createdWorkspace],
				workspaces: [createdWorkspace]
			},
			{ status: 201 }
		);
	} catch (error) {
		return json(
			{
				status: false,
				error: toErrorMessage(error)
			},
			{ status: 500 }
		);
	}
};
