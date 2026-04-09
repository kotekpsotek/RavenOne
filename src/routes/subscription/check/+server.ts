import { getAuthenticatedPayload } from "$lib/server/auth/request";
import { getWorkspaceActiveSubscription } from "$lib/server/subscription";
import { DB_Models } from "@ravenlens/backend";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { asNonEmptyString } from "../common";

type SubscriptionCheckRequestBody = {
	workspaceId?: unknown;
};

type WorkspaceDocumentRaw = {
	ownerUserId?: unknown;
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	let requestBody: SubscriptionCheckRequestBody;
	try {
		requestBody = await request.json() as SubscriptionCheckRequestBody;
	} catch {
		return json({ status: false, error: "Invalid request body" }, { status: 400 });
	}

	const workspaceId = asNonEmptyString(requestBody.workspaceId);
	if (!workspaceId) {
		return json({ status: false, error: "workspaceId is required" }, { status: 400 });
	}

	const payload = getAuthenticatedPayload(request, cookies);
	if (!payload) {
		return json({ status: false, error: "Unauthorized" }, { status: 401 });
	}

	try {
		const profileQuery: { id: string; email?: string } = { id: payload.userId };
		if (payload.email) {
			profileQuery.email = payload.email;
		}

		const currentUserProfile = await DB_Models.UserAccount.profileModel
			.findOne(profileQuery)
			.select({ _id: 1 })
			.lean<{ _id?: unknown }>();

		if (!currentUserProfile?._id) {
			return json({ status: false, error: "User profile not found" }, { status: 401 });
		}

		const workspaceAccessFilters: Record<string, unknown>[] = [
			{ ownerUserId: payload.userId },
			{ "workspaceMembers.user": currentUserProfile._id },
			{ "workspaceInvitements.user.id": payload.userId }
		];

		if (payload.email) {
			workspaceAccessFilters.push({ "workspaceInvitements.user.email": payload.email });
		}

		const workspace = await DB_Models.Workspace.Workspace.workspaceModel
			.findOne({
				id: workspaceId,
				$or: workspaceAccessFilters
			})
			.select({ ownerUserId: 1 })
			.lean<WorkspaceDocumentRaw>();

		if (!workspace) {
			return json({ status: false, error: "Access denied for this workspace" }, { status: 403 });
		}

		const ownerUserId = asNonEmptyString(workspace.ownerUserId);
		if (!ownerUserId) {
			return json({ status: false, error: "Workspace owner is invalid" }, { status: 500 });
		}

		const workspaceSubscription = await getWorkspaceActiveSubscription(workspaceId);
		const subscriptionKind = workspaceSubscription.hasActiveSubscription
			? workspaceSubscription.subscriptionKind
			: undefined;

		return json(
			{
				status: true,
				isWorkspaceOwner: ownerUserId === payload.userId,
				subscriptionKind
			},
			{ status: 200 }
		);
	} catch {
		return json({ status: false, error: "Failed to check workspace subscription" }, { status: 500 });
	}
};
