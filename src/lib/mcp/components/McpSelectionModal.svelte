<script lang="ts">
    import { mcpConfigurationStore, saveMcpConfiguration, selectedMcpServers, type McpConfiguration, type McpServerConfig, type McpValidationResult } from "$lib/stores/mcpConfig";
    import { UI } from "@ravenlens/frontend";
    import CodeMirror from "svelte-codemirror-editor";
    import { json } from "@codemirror/lang-json";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { alertState } from "$lib/utils/alert";

    let {
        open = $bindable(false),
        mcpConfigurationDraft = $bindable(""),
        mcpConfigurationError = $bindable("")
    } = $props<{
        open: boolean;
        mcpConfigurationDraft: string;
        mcpConfigurationError: string;
    }>();
    
    let saving = $state(false);

    function closeMcpConfigurationEditor() {
        open = false;
        mcpConfigurationError = "";
    }

    // Send modified MCP Configuration to server
    async function acceptMcpConfiguration() {
        const validation = validateMcpConfiguration(mcpConfigurationDraft);
        if (!validation.valid) {
            mcpConfigurationError = validation.error;
            return;
        }

        const frontendSave = () => {
            $mcpConfigurationStore = validation.normalized;
            saveMcpConfiguration($mcpConfigurationStore);
            $selectedMcpServers = validation.servers;
            mcpConfigurationError = "";
            open = false;
        }
        
        saving = true;
        try {
            const saveMCPConfigResponse = await fetchAuthenticated(
                "/mcp-config/servers-spec",
                {
                    method: "PUT",
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        workspaceId: $selectedWorkspace?.id,
                        mcpConfig: validation.normalized
                    })
                }
            );

            if (saveMCPConfigResponse.ok) {
                $alertState = {
                    alert: {
                        type: "success",
                        name: "Saved MCP Configuration Changes",
                        description: 'MCP Configuration is changed'
                    },
                    timeoutMs: 3_000
                }

                // Save config on frontend side
                frontendSave();
            }
            else {
                console.error('Cannot save MCP-Configuration because of status: ', saveMCPConfigResponse.status);
                $alertState = {
                    alert: {
                        type: "error",
                        name: "Cannot save MCP Configuration Changes",
                        description: 'Cannot save MCP-Configuration because of response-status: ' + saveMCPConfigResponse.status
                    },
                    timeoutMs: 8_000
                }
            }
        } finally {
            saving = false;
        }
    }

    function validateMcpConfiguration(rawConfiguration: string): McpValidationResult {
        try {
            const parsed = JSON.parse(rawConfiguration) as Partial<McpConfiguration>;

            if (!parsed || typeof parsed !== "object") {
                return { valid: false, error: "Configuration must be a JSON object." };
            }

            if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
                return { valid: false, error: 'Configuration must contain a "mcpServers" object.' };
            }

            const serverEntries = Object.entries(parsed.mcpServers);

            for (const [serverName, serverConfig] of serverEntries) {
                if (!serverConfig || typeof serverConfig !== "object") {
                    return { valid: false, error: `Server "${serverName}" must be an object.` };
                }

                if (typeof (serverConfig as McpServerConfig).command !== "string" ||
                    !(serverConfig as McpServerConfig).command.trim()) {
                    return { valid: false, error: `Server "${serverName}" must include a non-empty "command" string.` };
                }

                const args = (serverConfig as McpServerConfig).args;
                if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
                    return { valid: false, error: `Server "${serverName}" must include an "args" array of strings.` };
                }

                if ((serverConfig as McpServerConfig).env !== undefined) {
                    const envValue = (serverConfig as McpServerConfig).env;
                    const isRecord = !!envValue && typeof envValue === "object" && !Array.isArray(envValue);
                    if (!isRecord || Object.values(envValue as Record<string, unknown>).some((value) => typeof value !== "string")) {
                        return { valid: false, error: `Server "${serverName}" has invalid "env". It must be an object of string values.` };
                    }
                }
            }

            return {
                valid: true,
                normalized: JSON.stringify(parsed, null, 2),
                servers: serverEntries.map(([serverName]) => serverName)
            };
        } catch {
            return { valid: false, error: "Invalid JSON format. Please fix syntax errors before accepting." };
        }
    }
</script>

{#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-[60] bg-black/40" onclick={closeMcpConfigurationEditor}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="flex min-h-full items-center justify-center p-4" onclick={(event) => event.stopPropagation()}>
            <UI.Modals.ModalWrapper
                name="MCP configuration"
                bind:open={open}
                closeOnBackdrop={true}
                modalClassExtension="max-w-[1000px]"
                on:close={closeMcpConfigurationEditor}
            >
                <UI.Modals.ModalWrapperHeading
                    headingName="MCP servers configuration"
                    on:close={closeMcpConfigurationEditor}
                />

                <div class="pt-2 space-y-2">
                    {#if mcpConfigurationError}
                        <p class="text-sm text-error font-medium">{mcpConfigurationError}</p>
                    {/if}

                    <div class="rounded border border-base-300 bg-base-100 overflow-auto max-h-[60vh]">
                        <CodeMirror
                            bind:value={mcpConfigurationDraft}
                            lang={json()}
                            lineNumbers={true}
                            lineWrapping={false}
                            styles={{
                                "&": {
                                    minWidth: "48rem",
                                    height: "50vh"
                                }
                            }}
                        />
                    </div>
                </div>

                <div class="mt-4 flex justify-end gap-2">
                    <button class="btn btn-ghost" onclick={closeMcpConfigurationEditor} disabled={saving}>Cancel</button>
                    <button class="btn btn-primary" onclick={acceptMcpConfiguration} disabled={saving}>
                        {#if saving}
                            <span class="loading loading-spinner loading-sm"></span>
                        {/if}
                        Save
                    </button>
                </div>
            </UI.Modals.ModalWrapper>
        </div>
    </div>
{/if}