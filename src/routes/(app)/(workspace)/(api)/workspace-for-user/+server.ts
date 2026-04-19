import { getAuthenticatedPayload } from "$lib/server/auth/request";
import { DB_Models } from "@ravenlens/backend";
import { Permissions, Workspace } from "@ravenlens/shared";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type WorkspaceForUser = Workspace.Workspace.WorkspaceForUser;
type WorkspaceMember = Workspace.Workspace.WorkspaceMember;
type WorkspaceInvitement = Workspace.Workspace.WorkspaceMemberInvitement;
type WorkspacePermission = WorkspaceForUser["userPermissions"][number];

type WorkspaceMemberRaw = {
	user?: WorkspaceMember;
	permissions?: WorkspaceMember["permissions"];
};

type WorkspaceInvitementUserRaw = {
	email?: unknown;
	id?: unknown;
	name?: unknown;
	profileImgURL?: unknown;
};

type WorkspaceInvitementInvitedByRaw = {
	userName?: unknown;
	userId?: unknown;
	userProfileImgURL?: unknown;
};

type WorkspaceInvitementRaw = {
	id?: unknown;
	user?: unknown;
	kind?: unknown;
	withPermissions?: unknown;
	invitedBy?: unknown;
	invitedOn?: unknown;
};

type WorkspaceDocumentRaw = {
	id?: unknown;
	name?: unknown;
	imageUrl?: unknown;
	ownerUserId?: unknown;
	workspaceMembers?: WorkspaceMemberRaw[];
	workspaceInvitements?: WorkspaceInvitementRaw[];
};

type ProfileDocumentRaw = {
	_id?: unknown;
	id?: unknown;
	name?: unknown;
	email?: unknown;
};

type CurrentUserContext = {
	profileId: string;
	profileObjectId?: string;
	email?: string;
};

const WORKSPACE_INVITEMENT_KINDS = new Set<Workspace.Workspace.InvitementKind>([
	"email",
	"github",
	"linkedin",
	"goolge"
]);

const ALLOWED_WORKSPACE_PERMISSIONS = new Set<WorkspacePermission>(
	Object.keys(Permissions.Workspace.worspacePermissionLeaderBoardAndNames) as WorkspacePermission[]
);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length ? trimmed : undefined;
}

function normalizeObjectId(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length ? trimmed : undefined;
	}

	if (
		value &&
		typeof value === "object" &&
		"toString" in value &&
		typeof (value as { toString: () => string }).toString === "function"
	) {
		const normalized = (value as { toString: () => string }).toString().trim();
		return normalized.length ? normalized : undefined;
	}

	return undefined;
}

function buildForwardedAuthHeaders(request: Request): Headers {
	const forwardedHeaders = new Headers();
	const authorization = request.headers.get("authorization");
	const cookieHeader = request.headers.get("cookie");

	if (authorization) {
		forwardedHeaders.set("authorization", authorization);
	}

	if (cookieHeader) {
		forwardedHeaders.set("cookie", cookieHeader);
	}

	return forwardedHeaders;
}

async function ensureAuthenticatedViaRoute(request: Request, fetchFn: typeof fetch): Promise<Response | null> {
	try {
		const response = await fetchFn("/auth/is-authenticated", {
			method: "GET",
			headers: buildForwardedAuthHeaders(request)
		});

		return response;
	} catch {
		return null;
	}
}

function allWorkspacePermissions(): WorkspacePermission[] {
	return Object.keys(Permissions.Workspace.worspacePermissionLeaderBoardAndNames) as WorkspacePermission[];
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

function normalizeDate(value: unknown): Date {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value;
	}

	if (typeof value === "string" || typeof value === "number") {
		const dateCandidate = new Date(value);
		if (!Number.isNaN(dateCandidate.getTime())) {
			return dateCandidate;
		}
	}

	return new Date(0);
}

async function toWorkspaceMembers(
	workspaceMembersRaw: WorkspaceMemberRaw[] | undefined,
	profilesByObjectId: Map<string, ProfileDocumentRaw>
): Promise<Workspace.Workspace.WorkspaceUser[]> {
	if (!Array.isArray(workspaceMembersRaw)) {
		return [];
	}

	const members: Workspace.Workspace.WorkspaceUser[] = [];

	for (const memberRaw of workspaceMembersRaw) {
		const memberObjectId = normalizeObjectId(memberRaw.user);
		if (!memberObjectId) {
			continue;
		}

		const userDB = await DB_Models.UserAccount.profileModel.findById(memberRaw.user)

		if (userDB) {
			members.push({
				userId: userDB.id,
				profileImgURL: userDB.profileImgURL,
				name: userDB.name,
				permissions: memberRaw.permissions ?? [],
				joinDate: memberRaw.user?.joinDate ?? new Date()
			} satisfies Workspace.Workspace.WorkspaceUser);
		}
	}

	return members;
}

function toWorkspaceInvitements(workspaceInvitementsRaw: WorkspaceInvitementRaw[] | undefined): WorkspaceInvitement[] {
	if (!Array.isArray(workspaceInvitementsRaw)) {
		return [];
	}

	const invitements: WorkspaceInvitement[] = [];

	for (const invitementRaw of workspaceInvitementsRaw) {
		if (!isRecord(invitementRaw.user) || !isRecord(invitementRaw.invitedBy)) {
			continue;
		}

		const invitementUser = invitementRaw.user as WorkspaceInvitementUserRaw;
		const invitedBy = invitementRaw.invitedBy as WorkspaceInvitementInvitedByRaw;

		const id = asString(invitementRaw.id);
		const kindCandidate = asString(invitementRaw.kind);
		const userName = asString(invitementUser.name);
		const invitedByUserName = asString(invitedBy.userName);
		const invitedByUserId = asString(invitedBy.userId);

		if (!id || !kindCandidate || !userName || !invitedByUserName || !invitedByUserId) {
			continue;
		}

		if (!WORKSPACE_INVITEMENT_KINDS.has(kindCandidate as Workspace.Workspace.InvitementKind)) {
			continue;
		}

		const normalizedInvitement: WorkspaceInvitement = {
			id,
			kind: kindCandidate as Workspace.Workspace.InvitementKind,
			user: {
				name: userName,
				...(asString(invitementUser.email) ? { email: asString(invitementUser.email) } : {}),
				...(asString(invitementUser.id) ? { id: asString(invitementUser.id) } : {}),
				...(asString(invitementUser.profileImgURL)
					? { profileImgURL: asString(invitementUser.profileImgURL) }
					: {})
			},
			withPermissions: normalizePermissions(invitementRaw.withPermissions),
			invitedBy: {
				userName: invitedByUserName,
				userId: invitedByUserId,
				userProfileImgURL: asString(invitedBy.userProfileImgURL) ?? ""
			},
			invitedOn: normalizeDate(invitementRaw.invitedOn)
		};

		invitements.push(normalizedInvitement);
	}

	return invitements;
}

function resolveCurrentUserPermissions(workspace: WorkspaceDocumentRaw, currentUser: CurrentUserContext): WorkspacePermission[] {
	if (asString(workspace.ownerUserId) === currentUser.profileId) {
		return allWorkspacePermissions();
	}

	if (Array.isArray(workspace.workspaceMembers) && currentUser.profileObjectId) {
		const workspaceMember = workspace.workspaceMembers.find(member => {
			return normalizeObjectId(member.user) === currentUser.profileObjectId;
		});

		const memberPermissions = normalizePermissions(workspaceMember?.permissions);
		if (memberPermissions.length) {
			return memberPermissions;
		}
	}

	if (Array.isArray(workspace.workspaceInvitements)) {
		const matchedInvitement = workspace.workspaceInvitements.find(invitement => {
			if (!isRecord(invitement.user)) {
				return false;
			}

			const invitementUser = invitement.user as WorkspaceInvitementUserRaw;
			const invitementEmail = asString(invitementUser.email);
			const invitementId = asString(invitementUser.id);

			const matchesEmail = Boolean(currentUser.email && invitementEmail && currentUser.email === invitementEmail);
			const matchesId = Boolean(invitementId && invitementId === currentUser.profileId);

			return matchesEmail || matchesId;
		});

		if (matchedInvitement) {
			return normalizePermissions(matchedInvitement.withPermissions);
		}
	}

	return [];
}

/** Download workspace members with suitable form */
export const POST: RequestHandler = async ({ request, cookies, fetch, url }) => {
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

	const workspaceId = url.searchParams.get("workspaceId")?.trim();
	if (!workspaceId) {
		return json({ status: false, error: "workspaceId query parameter is required" }, { status: 400 });
	}

	try {
		const profileQuery: { id: string; email?: string } = { id: payload.userId };
		if (payload.email) {
			profileQuery.email = payload.email;
		}

		const userProfile = await DB_Models.UserAccount.profileModel.findOne(profileQuery).lean<ProfileDocumentRaw>();
		if (!userProfile) {
			return json({ status: false, error: "User profile not found" }, { status: 404 });
		}

		const userProfileObjectId = normalizeObjectId(userProfile._id);
		if (!userProfileObjectId) {
			return json({ status: false, error: "User profile is invalid" }, { status: 500 });
		}

		const downloadedWorkspace = await DB_Models.Workspace.Workspace.workspaceModel
			.findOne({
				id: workspaceId,
				"workspaceMembers.user": userProfileObjectId
			})
			.lean<WorkspaceDocumentRaw>();

		if (!downloadedWorkspace) {
			return json({ status: false, error: "Workspace not found" }, { status: 404 });
		}

		const id = asString(downloadedWorkspace.id);
		const name = asString(downloadedWorkspace.name);
		const ownerUserId = asString(downloadedWorkspace.ownerUserId);
		const imageUrl = asString(downloadedWorkspace.imageUrl) ?? "";

		if (!id || !name || !ownerUserId) {
			return json({ status: false, error: "Workspace payload is invalid" }, { status: 500 });
		}

		const memberObjectIds = new Set<string>();
		for (const member of downloadedWorkspace.workspaceMembers ?? []) {
			const memberObjectId = normalizeObjectId(member.user);
			if (memberObjectId) {
				memberObjectIds.add(memberObjectId);
			}
		}

		let memberProfiles: ProfileDocumentRaw[] = [];
		if (memberObjectIds.size) {
			memberProfiles = await DB_Models.UserAccount.profileModel
				.find({ _id: { $in: [...memberObjectIds] } })
				.select({ _id: 1, id: 1, name: 1 })
				.lean<ProfileDocumentRaw[]>();
		}

		const profilesByObjectId = new Map<string, ProfileDocumentRaw>();
		for (const profile of memberProfiles) {
			const profileObjectId = normalizeObjectId(profile._id);
			if (profileObjectId) {
				profilesByObjectId.set(profileObjectId, profile);
			}
		}

		const workspaceForUser: WorkspaceForUser = {
			id,
			name,
			imageUrl,
			ownerUserId,
			workspaceMembers: await toWorkspaceMembers(downloadedWorkspace.workspaceMembers, profilesByObjectId),
			workspaceInvitements: toWorkspaceInvitements(downloadedWorkspace.workspaceInvitements),
			isOwner: ownerUserId === payload.userId,
			userPermissions: resolveCurrentUserPermissions(downloadedWorkspace, {
				profileId: payload.userId,
				profileObjectId: userProfileObjectId,
				email: payload.email
			})
		};

		return json({ status: true, workspace: workspaceForUser }, { status: 200 });
	} catch {
		return json({ status: false, error: "Failed to load workspace" }, { status: 500 });
	}
};
