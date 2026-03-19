import { browser } from "$app/environment";
import { get, writable } from "svelte/store";

const MCP_CONFIG_STORAGE_KEY = "ravenone:mcp-config";

function getInitialMcpConfig() {
    if (!browser) {
        return "";
    }

    return localStorage.getItem(MCP_CONFIG_STORAGE_KEY) ?? "";
}

export type McpServerConfig = {
    type?: "stdio";
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    stderr?: string | number;
};

export type McpRemoteServerConfig = {
    type?: "http" | "streamable-http" | "streamableHttp" | "sse" | string;
    url: string;
    headers?: Record<string, string>;
};

export type McpAnyServerConfig = McpServerConfig | McpRemoteServerConfig;

export type McpConfiguration = {
    mcpServers: Record<string, McpAnyServerConfig>;
};

export type McpValidationResult =
    | {
        valid: true;
        normalized: string;
        servers: string[];
    }
    | {
        valid: false;
        error: string;
    };

const initialMcpConfigurationObject: McpConfiguration = {
    mcpServers: {
        github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"]
        },
        filesystem: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "./"]
        },
        memory: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-memory"]
        },
        browser: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-browser"]
        }
    }
};

export const mcpConfigurationStore = writable<string>(getInitialMcpConfig());
export const selectedMcpServers = writable<string[]>([]);

if (browser) {
    mcpConfigurationStore.subscribe((value) => {
        // Setups config state to browser `localStorage`
        if (value) {
            localStorage.setItem(MCP_CONFIG_STORAGE_KEY, value);
        }

        // Setups mcp servers from config
        try {
            const mcpConfiguration = get(mcpConfigurationStore);
            const parsed = JSON.parse(mcpConfiguration);
            selectedMcpServers.set(Object.keys(parsed.mcpServers || {}));
        } catch {
            selectedMcpServers.set(Object.keys(initialMcpConfigurationObject.mcpServers));
        }
    });
}

export function saveMcpConfiguration(value: string) {
    mcpConfigurationStore.set(value);
}

