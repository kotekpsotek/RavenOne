import { ensureAuthenticatedViaRoute, getAuthenticatedPayload } from "$lib/server/auth/request";
import { DB_Models } from "@ravenlens/backend";
import { Permissions, Workspace } from "@ravenlens/shared";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type WorkspaceEntry = Workspace.Workspace.WorkspaceUserEntryLoaded;
type WorkspacePermission = WorkspaceEntry["userPermissions"][number];

type WorkspaceMemberRaw = {
	user?: unknown;
	permissions?: WorkspacePermission[];
};

type WorkspaceInvitementRaw = {
	user?: {
		email?: string;
		id?: string;
	};
	withPermissions?: WorkspacePermission[];
};

type WorkspaceDocumentRaw = {
	id?: unknown;
	name?: unknown;
	imageUrl?: unknown;
	ownerUserId?: unknown;
	workspaceMembers?: WorkspaceMemberRaw[];
	workspaceInvitements?: WorkspaceInvitementRaw[];
};

function normalizeObjectId(value: unknown): string | undefined {
	if (typeof value === "string") {
		return value;
	}

	if (
		value &&
		typeof value === "object" &&
		"toString" in value &&
		typeof (value as { toString: () => string }).toString === "function"
	) {
		return (value as { toString: () => string }).toString();
	}

	return undefined;
}

function allWorkspacePermissions(): WorkspacePermission[] {
	return Object.keys(Permissions.Workspace.worspacePermissionLeaderBoardAndNames) as WorkspacePermission[];
}

function toWorkspaceEntry(
	workspace: WorkspaceDocumentRaw,
	currentUser: {
		profileId: string;
		profileObjectId?: string;
		email?: string;
	}
): WorkspaceEntry | undefined {
	const id = workspace.id;
	const name = workspace.name;
	const imageUrl = workspace.imageUrl;
	const ownerUserId = workspace.ownerUserId;

	if (
		typeof id !== "string" ||
		typeof name !== "string" ||
		typeof imageUrl !== "string" ||
		typeof ownerUserId !== "string"
	) {
		return undefined;
	}

	const isOwner = ownerUserId === currentUser.profileId;
	let userPermissions: WorkspacePermission[] = [];

	if (isOwner) {
		userPermissions = allWorkspacePermissions();
	} else {
		if (Array.isArray(workspace.workspaceMembers) && currentUser.profileObjectId) {
			const workspaceMember = workspace.workspaceMembers.find(member => {
				const memberUserId = normalizeObjectId(member.user);
				return memberUserId === currentUser.profileObjectId;
			});

			if (workspaceMember?.permissions && Array.isArray(workspaceMember.permissions)) {
				userPermissions = workspaceMember.permissions;
			}
		}

		if (!userPermissions.length && Array.isArray(workspace.workspaceInvitements)) {
			const matchedInvitement = workspace.workspaceInvitements.find(invitement => {
				const invitementUser = invitement.user;
				if (!invitementUser) {
					return false;
				}

				const matchesEmail = Boolean(currentUser.email && invitementUser.email === currentUser.email);
				const matchesId = invitementUser.id === currentUser.profileId;

				return matchesEmail || matchesId;
			});

			if (matchedInvitement?.withPermissions && Array.isArray(matchedInvitement.withPermissions)) {
				userPermissions = matchedInvitement.withPermissions;
			}
		}
	}

	return {
		id,
		name,
		imageUrl,
		ownerUserId,
		isOwner,
		userPermissions
	};
}

export const GET: RequestHandler = async ({ request, cookies, fetch }) => {
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

	try {
        //
		const profileQuery: { id: string; email?: string } = { id: payload.userId };
		if (payload.email) {
			profileQuery.email = payload.email;
		}

        //
		const userProfile = await DB_Models.UserAccount.profileModel.findOne(profileQuery);
		if (!userProfile) {
			return json({ status: false, error: "User profile not found" }, { status: 404 });
		}

        //
		const userProfileObjectId = normalizeObjectId((userProfile as { _id?: unknown })._id);
		const workspaceFilters: Record<string, unknown>[] = [{ ownerUserId: payload.userId }];

        //
		if (userProfileObjectId) {
			workspaceFilters.push({ "workspaceMembers.user": userProfileObjectId });
		}

		if (payload.email) {
			workspaceFilters.push({ "workspaceInvitements.user.email": payload.email });
		}

		workspaceFilters.push({ "workspaceInvitements.user.id": payload.userId });

        //
		const downloadedWorkspaces: WorkspaceDocumentRaw[] = await DB_Models.Workspace.Workspace.workspaceModel
			.find({ $or: workspaceFilters })
			.lean();

        //
		const avaiableWorkspaces = downloadedWorkspaces
			.map(workspace => {
				return toWorkspaceEntry(workspace, {
					profileId: payload.userId,
					profileObjectId: userProfileObjectId,
					email: payload.email
				});
			})
			.filter((workspace): workspace is WorkspaceEntry => Boolean(workspace));

        //
		return json(
			{
				status: true,
				avaiableWorkspaces,
				workspaces: avaiableWorkspaces
			},
			{ status: 200 }
		);
	} catch {
		return json({ status: false, error: "Failed to load workspaces" }, { status: 500 });
	}
};
