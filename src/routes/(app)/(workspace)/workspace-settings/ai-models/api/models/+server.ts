import type {
	GetWorkspaceModelsResponse,
	SaveWorkspaceModelRequest,
	SaveWorkspaceModelResponse
} from "$lib/workspace-settings/ai-models/types";
import { json, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ request }) => {
	const authorization = request.headers.get("authorization");

	if (!authorization) {
		return json({ message: "Missing Authorization header" }, { status: 401 });
	}

	// TODO: Validate JWT from authorization header and resolve authenticated user.
	const responseBody: GetWorkspaceModelsResponse = {
		models: []
	};

	return json(responseBody, { status: 200 });
};

export const POST: RequestHandler = async ({ request }) => {
	const authorization = request.headers.get("authorization");

	if (!authorization) {
		return json({ message: "Missing Authorization header" }, { status: 401 });
	}

	// TODO: Validate JWT from authorization header and resolve authenticated user.
	const payload = (await request.json()) as SaveWorkspaceModelRequest;

	// TODO: Persist payload.model for payload.workspace in database.

	const responseBody: SaveWorkspaceModelResponse = {
		saved: true,
		model: payload.model.id
			? {
					id: payload.model.id,
					provider: payload.model.provider,
					modelName: payload.model.modelName,
					isDefault: payload.model.isDefault,
					createdAt: new Date().toISOString()
				}
			: undefined
	};

	return json(responseBody, { status: 200 });
};
