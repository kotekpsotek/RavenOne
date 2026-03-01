import { json, type RequestHandler } from "@sveltejs/kit";

export interface WorkspacePayload {
    id: string;
    name: string;
    imageUrl?: string;
    ownerUserId: string;
    isOwner: boolean;
    userPermissions: string[];
}

export interface WorkspaceModelEntry {
    id: string;
    provider: string;
    modelName: string;
    isDefault: boolean;
    createdAt: string;
}

export interface GetWorkspaceModelsResponse {
    models: WorkspaceModelEntry[];
}

export interface SaveWorkspaceModelRequest {
    workspace: WorkspacePayload;
    model: {
        id?: string;
        provider: string;
        modelName: string;
        isDefault: boolean;
    };
}

export interface SaveWorkspaceModelResponse {
    saved: boolean;
    model?: WorkspaceModelEntry;
}

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

    const payload = await request.json() as SaveWorkspaceModelRequest;

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
