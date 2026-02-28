import { browser } from "$app/environment";
import { writable } from "svelte/store";

const MCP_CONFIG_STORAGE_KEY = "ravenone:mcp-config";

function getInitialMcpConfig() {
    if (!browser) {
        return "";
    }

    return localStorage.getItem(MCP_CONFIG_STORAGE_KEY) ?? "";
}

export const mcpConfigurationStore = writable<string>(getInitialMcpConfig());

if (browser) {
    mcpConfigurationStore.subscribe((value) => {
        if (value) {
            localStorage.setItem(MCP_CONFIG_STORAGE_KEY, value);
        }
    });
}

export function saveMcpConfiguration(value: string) {
    mcpConfigurationStore.set(value);
}
