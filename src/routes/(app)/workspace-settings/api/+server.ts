import { getAuthenticatedPayload } from "$lib/server/auth/request";
import { DB_Models } from "@ravenlens/backend";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type DeleteWorkspaceRequestBody = {
	workspaceId?: unknown;
};

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

function asNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length ? trimmed : undefined;
}

async function readWorkspaceId(request: Request, url: URL): Promise<string | undefined> {
	const workspaceIdFromQuery = asNonEmptyString(url.searchParams.get("workspaceId"));
	if (workspaceIdFromQuery) {
		return workspaceIdFromQuery;
	}

	let requestBody: DeleteWorkspaceRequestBody;
	try {
		requestBody = (await request.json()) as DeleteWorkspaceRequestBody;
	} catch {
		return undefined;
	}

	return asNonEmptyString(requestBody.workspaceId);
}

export const DELETE: RequestHandler = async ({ request, cookies, fetch, url }) => {
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

	const workspaceId = await readWorkspaceId(request, url);
	if (!workspaceId) {
		return json({ status: false, error: "workspaceId is required" }, { status: 400 });
	}

	try {
		const deletedWorkspace = await DB_Models.Workspace.Workspace.workspaceModel
			.findOneAndDelete({
				id: workspaceId,
				ownerUserId: payload.userId
			})
			.lean();

		if (!deletedWorkspace) {
			const workspaceExists = await DB_Models.Workspace.Workspace.workspaceModel
				.findOne({ id: workspaceId })
				.select({ id: 1, _id: 0 })
				.lean();

			if (!workspaceExists) {
				return json({ status: false, error: "Workspace not found" }, { status: 404 });
			}

			return json({ status: false, error: "Only workspace owner can delete this workspace" }, { status: 403 });
		}

		return json(
			{
				status: true,
				deleted: true,
				workspaceId
			},
			{ status: 200 }
		);
	} catch {
		return json({ status: false, error: "Failed to delete workspace" }, { status: 500 });
	}
};
