import { prefetchWorkspaceWithMembers } from "$lib/server/db";
import { extractBearerToken } from "$lib/server/auth/request";
import { downloadCurrentUser } from "$lib/utils/auth";
import type {
	DeleteWorkspaceApiKeyRequest,
	DeleteWorkspaceApiKeyResponse,
	GetWorkspaceApiKeysResponse,
	SaveWorkspaceApiKeyRequest,
	SaveWorkspaceApiKeyResponse,
	WorkspaceApiKeyEntry
} from "$lib/workspace-settings/ai-models/types";
import { DB_Models } from "@ravenlens/backend";
import { json, type RequestHandler } from "@sveltejs/kit";
import type { Document } from "mongoose";

const ALLOWED_AI_PROVIDERS = new Set(["OpenAI", "Google", "Anthropic"]);

function asNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length ? trimmed : undefined;
}

function unauthorizedResponse(message = "You're not authenticated") {
	return json({ message }, { status: 401 });
}

function formatApiKeyEntry(apiKey: DB_Models.Workspace.APIKey.APIKey & Document): WorkspaceApiKeyEntry {
	const key = apiKey.key;

	return {
		id: apiKey._id.toString(),
		provider: apiKey.provider,
		// Intentionally returned for authorized users to allow reveal/copy in workspace settings UI.
		apiKey: key,
		maskedApiKey: key,
		createdAt: apiKey.addedAt.toISOString()
	};
}

async function resolveCurrentUserId(request: Request, origin: string): Promise<string | Response> {
	const authorization = request.headers.get("authorization");
	if (!authorization) {
		return json({ message: "Missing Authorization header" }, { status: 401 });
	}

	const jwt = extractBearerToken(request);
	if (!jwt) {
		return unauthorizedResponse();
	}

	const authenticationResponse = await downloadCurrentUser(jwt, origin);
	if (!authenticationResponse.status || !authenticationResponse.data) {
		return unauthorizedResponse("You're not authenticated member");
	}

	const currentUserId = asNonEmptyString(authenticationResponse.data.user.id);
	if (!currentUserId) {
		return unauthorizedResponse("You're not authenticated member");
	}

	return currentUserId;
}

async function assertWorkspaceAccess(workspaceId: string, currentUserId: string) {
	const workspace = await prefetchWorkspaceWithMembers(workspaceId);
	if (!workspace) {
		return json({ message: "Following workspace doesn't exist" }, { status: 404 });
	}

	const isWorkspaceOwner = workspace.ownerUserId === currentUserId;
	const workspaceMember = workspace.workspaceMembers.find((member) => member.user?.id === currentUserId);
	if (!workspaceMember && !isWorkspaceOwner) {
		return unauthorizedResponse("You're not workspace member");
	}

	return null;
}

/** Get api keys */
export const GET: RequestHandler = async ({ request, url }) => {
	const workspaceId = asNonEmptyString(url.searchParams.get("workspaceId"));
	if (!workspaceId) {
		return new Response("'workspaceId' Is required to arrive as search params", { status: 400 });
	}

	const currentUserId = await resolveCurrentUserId(request, url.origin);
	if (currentUserId instanceof Response) {
		return currentUserId;
	}

	const accessError = await assertWorkspaceAccess(workspaceId, currentUserId);
	if (accessError) {
		return accessError;
	}

	const foundAPIKeys: (DB_Models.Workspace.APIKey.APIKey & Document)[] = await DB_Models.Workspace.APIKey.apiKeyModel
		.find({ workspaceId })
		.sort({ addedAt: -1 });

	const responseBody: GetWorkspaceApiKeysResponse = {
		apiKeys: foundAPIKeys.map(formatApiKeyEntry)
	};

	return json(responseBody, { status: 200 });
};

/** Save API Key */
export const POST: RequestHandler = async ({ request, url }) => {
	const currentUserId = await resolveCurrentUserId(request, url.origin);
	if (currentUserId instanceof Response) {
		return currentUserId;
	}

	let payload: SaveWorkspaceApiKeyRequest;
	try {
		payload = (await request.json()) as SaveWorkspaceApiKeyRequest;
	} catch {
		return json({ message: "Invalid request body" }, { status: 400 });
	}

	const workspaceId = asNonEmptyString(payload?.workspace?.id);
	const provider = asNonEmptyString(payload?.provider);
	const apiKey = asNonEmptyString(payload?.apiKey);

	if (!workspaceId || !provider || !apiKey) {
		return json({ message: "workspace.id, provider and apiKey are required" }, { status: 400 });
	}

	if (!ALLOWED_AI_PROVIDERS.has(provider)) {
		return json({ message: "Invalid AI provider" }, { status: 400 });
	}

	if (payload?.mode !== "add" && payload?.mode !== "edit") {
		return json({ message: "mode must be either 'add' or 'edit'" }, { status: 400 });
	}

	const accessError = await assertWorkspaceAccess(workspaceId, currentUserId);
	if (accessError) {
		return accessError;
	}

	const currentUserProfile = await DB_Models.UserAccount.profileModel
		.findOne({ id: currentUserId })
		.select({ _id: 1 })
		.lean<{ _id?: unknown }>();

	if (!currentUserProfile?._id) {
		return json({ message: "Following user profile was not found" }, { status: 404 });
	}

	if (payload.mode === "add") {
		const existingApiKey = await DB_Models.Workspace.APIKey.apiKeyModel
			.findOne({ workspaceId, provider })
			.select({ _id: 1 })
			.lean<{ _id?: unknown }>();

		if (existingApiKey?._id) {
			return json({ message: "API key for this provider already exists in workspace" }, { status: 409 });
		}

		const createdApiKey = (await DB_Models.Workspace.APIKey.apiKeyModel.create({
			workspaceId,
			provider,
			key: apiKey,
			addedBy: currentUserProfile._id,
			addedAt: new Date()
		})) as DB_Models.Workspace.APIKey.APIKey & Document;

		const responseBody: SaveWorkspaceApiKeyResponse = {
			saved: true,
			entry: formatApiKeyEntry(createdApiKey)
		};

		return json(responseBody, { status: 200 });
	}

	const updatedApiKey = (await DB_Models.Workspace.APIKey.apiKeyModel.findOneAndUpdate(
		{
			workspaceId,
			provider
		},
		{
			$set: {
				key: apiKey,
				addedBy: currentUserProfile._id,
				addedAt: new Date()
			}
		},
		{
			new: true
		}
	)) as (DB_Models.Workspace.APIKey.APIKey & Document) | null;

	if (!updatedApiKey) {
		return json({ message: "API key for this provider doesn't exist in workspace" }, { status: 404 });
	}

	const responseBody: SaveWorkspaceApiKeyResponse = {
		saved: true,
		entry: formatApiKeyEntry(updatedApiKey)
	};

	return json(responseBody, { status: 200 });
};

/** Delete API Key */
export const DELETE: RequestHandler = async ({ request, url }) => {
	const currentUserId = await resolveCurrentUserId(request, url.origin);
	if (currentUserId instanceof Response) {
		return currentUserId;
	}

	let payload: DeleteWorkspaceApiKeyRequest;
	try {
		payload = (await request.json()) as DeleteWorkspaceApiKeyRequest;
	} catch {
		return json({ message: "Invalid request body" }, { status: 400 });
	}

	const workspaceId = asNonEmptyString(payload?.workspaceId);
	const provider = asNonEmptyString(payload?.provider);

	if (!workspaceId || !provider) {
		return json({ message: "workspaceId and provider are required" }, { status: 400 });
	}

	if (!ALLOWED_AI_PROVIDERS.has(provider)) {
		return json({ message: "Invalid AI provider" }, { status: 400 });
	}

	const accessError = await assertWorkspaceAccess(workspaceId, currentUserId);
	if (accessError) {
		return accessError;
	}

	const deleteResult = await DB_Models.Workspace.APIKey.apiKeyModel.deleteOne({
		workspaceId,
		provider
	});

	if (!deleteResult.deletedCount) {
		return json({ message: "API key for this provider doesn't exist in workspace" }, { status: 404 });
	}

	const responseBody: DeleteWorkspaceApiKeyResponse = {
		deleted: true
	};

	return json(responseBody, { status: 200 });
};
