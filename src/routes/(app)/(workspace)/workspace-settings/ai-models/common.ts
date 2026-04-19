import { selectedWorkspace } from "$lib/stores/workspace";
import { JWTAuth } from "$lib/utils/auth";
import { get } from "svelte/store";

export function handleGetJWT() {
    const jwt = JWTAuth.getToken();

    if (!jwt) {
        throw new Error("Cannot send request because JWT is missing");
    }

    return jwt;
}

export function handleGetSelectedWorkspace() {
    const selectedWorkspaceLocal = get(selectedWorkspace);
    if (!selectedWorkspaceLocal) {
        throw new Error("Cannot send request because no workspace is selected");
    }

    return selectedWorkspaceLocal;
}