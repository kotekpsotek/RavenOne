<script lang="ts">
    import { UI } from "@ravenlens/frontend";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { JWTAuth } from "$lib/utils/auth";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import type {
        GetWorkspaceApiKeysResponse,
        SaveWorkspaceApiKeyRequest,
        SaveWorkspaceApiKeyResponse
    } from "./api/apiKeys/server";
    import type {
        GetWorkspaceModelsResponse,
        SaveWorkspaceModelRequest,
        SaveWorkspaceModelResponse
    } from "./api/models/server";

    function handleGetJWT() {
        const jwt = JWTAuth.getToken();

        if (!jwt) {
            throw new Error("Cannot send request because JWT is missing");
        }

        return jwt;
    }

    function handleGetSelectedWorkspace() {
        if (!$selectedWorkspace) {
            throw new Error("Cannot send request because no workspace is selected");
        }

        return $selectedWorkspace;
    }

    async function handleRetrieveAPIKeys() {
        const workspace = handleGetSelectedWorkspace();
        const jwt = handleGetJWT();
        const endpoint = `/workspace-settings/ai-models/api/apiKeys?workspaceId=${encodeURIComponent(workspace.id)}`;
        const response = await fetchAuthenticated(endpoint, {
            method: "GET"
        }, jwt);

        if (!response.ok) {
            throw new Error("Failed to retrieve API keys");
        }

        const _responseBody = await response.json() as GetWorkspaceApiKeysResponse;
    }

    async function handleRetrieveModels() {
        const workspace = handleGetSelectedWorkspace();
        const jwt = handleGetJWT();
        const endpoint = `/workspace-settings/ai-models/api/models?workspaceId=${encodeURIComponent(workspace.id)}`;
        const response = await fetchAuthenticated(endpoint, {
            method: "GET"
        }, jwt);

        if (!response.ok) {
            throw new Error("Failed to retrieve models");
        }

        const _responseBody = await response.json() as GetWorkspaceModelsResponse;
    }

    const handleAPIKeySaved = async (ev: CustomEvent<{ mode: "add" | "edit"; provider: string; apiKey: string }>) => {
        const workspace = handleGetSelectedWorkspace();
        const jwt = handleGetJWT();
        const payload: SaveWorkspaceApiKeyRequest = {
            workspace,
            mode: ev.detail.mode,
            provider: String(ev.detail.provider),
            apiKey: ev.detail.apiKey
        };

        const response = await fetchAuthenticated("/workspace-settings/ai-models/api/apiKeys", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        }, jwt);

        if (!response.ok) {
            throw new Error("Failed to save API key");
        }

        const _responseBody = await response.json() as SaveWorkspaceApiKeyResponse;
        await handleRetrieveAPIKeys();
    };

    const handleAPIKeyDeleted = async (_ev: CustomEvent<{ provider: string }>) => {
        await handleRetrieveAPIKeys();
    };

    const handleModelSaved = async (ev: CustomEvent<{
        mode: "update" | "create";
        index: number;
        model: any;
    }>) => {
        const workspace = handleGetSelectedWorkspace();
        const jwt = handleGetJWT();
        const detail = ev.detail;
        const model = detail.model as unknown as Record<string, unknown>;
        const payload: SaveWorkspaceModelRequest = {
            workspace,
            model: {
                id: typeof model.id === "string" ? model.id : undefined,
                provider: typeof model.provider === "string" ? model.provider : "",
                modelName: typeof model.modelName === "string" ? model.modelName : "",
                isDefault: typeof model.isDefault === "boolean" ? model.isDefault : false
            }
        };

        const response = await fetchAuthenticated("/workspace-settings/ai-models/api/models", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        }, jwt);

        if (!response.ok) {
            throw new Error("Failed to save model");
        }

        const _responseBody = await response.json() as SaveWorkspaceModelResponse;
        await handleRetrieveModels();
    };

    const handleModelDeleted = async (_ev: CustomEvent<{ index: number; modelId: string }>) => {
        await handleRetrieveModels();
    };
</script>

<UI.Workspace.Settings.WorkspaceAIModelsScreen
    bgColor="bg-base-200"
    visibility={{
        evaluationFrequency: false,
        customModels: true,
        gEval: false,
        apiKeysTable: true
    }}
    on:apiKeySaved={handleAPIKeySaved}
    on:apiKeyDeleted={handleAPIKeyDeleted}
    on:modelSaved={handleModelSaved}
    on:modelDeleted={handleModelDeleted}
/>
