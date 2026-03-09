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
	apiKey: string;
	maskedApiKey?: string;
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

export interface DeleteWorkspaceApiKeyRequest {
	workspaceId: string;
	provider: string;
}

export interface DeleteWorkspaceApiKeyResponse {
	deleted: boolean;
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
