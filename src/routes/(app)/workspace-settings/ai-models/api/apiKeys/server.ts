import { json, type RequestHandler } from "@sveltejs/kit";

export interface WorkspacePayload {
    id: string;
    name: string;
    imageUrl?: string;
    ownerUserId: string;
    isOwner: boolean;
    userPermissions: string[];
}

export interface WorkspaceApiKeyEntry {
    id: string;
    provider: string;
    maskedApiKey: string;
    createdAt: string;
}

export interface GetWorkspaceApiKeysResponse {
    apiKeys: WorkspaceApiKeyEntry[];
}

export interface SaveWorkspaceApiKeyRequest {
    workspace: WorkspacePayload;
    mode: "add" | "edit";
    provider: string;
    apiKey: string;
}

export interface SaveWorkspaceApiKeyResponse {
    saved: boolean;
    entry?: WorkspaceApiKeyEntry;
}

export const GET: RequestHandler = async ({ request }) => {
    const authorization = request.headers.get("authorization");

    if (!authorization) {
        return json({ message: "Missing Authorization header" }, { status: 401 });
    }

    // TODO: Validate JWT from authorization header and resolve authenticated user.

    const responseBody: GetWorkspaceApiKeysResponse = {
        apiKeys: []
    };

    return json(responseBody, { status: 200 });
};

export const POST: RequestHandler = async ({ request }) => {
    const authorization = request.headers.get("authorization");

    if (!authorization) {
        return json({ message: "Missing Authorization header" }, { status: 401 });
    }

    // TODO: Validate JWT from authorization header and resolve authenticated user.

    const payload = await request.json() as SaveWorkspaceApiKeyRequest;

    // TODO: Persist payload.provider and payload.apiKey for payload.workspace in database.

    const maskedApiKey = payload.apiKey.length > 8
        ? `${payload.apiKey.slice(0, 4)}****${payload.apiKey.slice(-4)}`
        : "****";

    const responseBody: SaveWorkspaceApiKeyResponse = {
        saved: true,
        entry: {
            id: crypto.randomUUID(),
            provider: payload.provider,
            maskedApiKey,
            createdAt: new Date().toISOString()
        }
    };

    return json(responseBody, { status: 200 });
};