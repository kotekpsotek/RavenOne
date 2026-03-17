<script lang="ts">
	import Icon from "@iconify/svelte";
	import { UI } from "@ravenlens/frontend";
	import McpSelectionModal from "$lib/mcp/components/McpSelectionModal.svelte";
    import type { MCPConnectionStatusObject, MCPCredentials, MCPCredentialsBackendWithoutStatus } from "@ravenlens/shared/mcp";
	import "./MCPWorkspaceConfig.css";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { alertState } from "$lib/utils/alert";

    const { 
        mcpCredentials = undefined 
    }: { mcpCredentials: MCPCredentials | undefined  } = $props();
    
	const configurationSteps: string[] = [
		`Download and setup on your publicly available machine RavenOne MCP Middleware Server. Download server from <a href="">Github</a> or <a href="">Docker</a>`,
		`Establish <b>Secret Password</b> on side of MCP Middleware Server`,
		`Specify your server publicly available link at input url field in 'RavenOne > AI Models Settings'`,
		`Specify at 'RavenOne > AI Models Settings' same password as you've specified for RavenOne MCP Server Middleware`,
		`Specify the whitelist of available MCP servers with its configuration and required credentials in modal open with usage of 'Configure MCP Servers' button. Then click on "Save" button to save changes`,
		`Accept all setup by flick on "Accept" button below all so far specified fields`,
		`Verify connection state with specified <b>RavenOne MCP Middleware Server</b> by look on <u>"MCP RavenOne Server-Middleware URL" input</u> right-side <b>status-box</b>`
	];
	
	// Values of state
	let draftSecretPassword = $derived(mcpCredentials?.secretPassword ?? "");
	let revealSecretPassword = $state(false);
	let serverURL = $derived(mcpCredentials?.serverURL);
	let connectionState = $derived(mcpCredentials?.status);

	// Derived
	let isServerURLValidState = $derived(isServerURLValid(serverURL));
	let isPasswordValidState = $derived(isPasswordValid(draftSecretPassword))
	let isSomeValueChanged = $derived((mcpCredentials?.secretPassword !== draftSecretPassword || mcpCredentials?.serverURL !== serverURL))

	// Modals open state
	let setupModalOpen = $state(false);
	let mcpConfigurationEditorOpen = $state(false);
	let invalidReasonModalOpen = $state(false);

	let saving = $state(false);
	let downloading = $state(false);
	let initialServersSpecification = $state("");

	// Helpers
	function isServerURLValid(serverURL: string | undefined) {
		try {
			if (!serverURL?.trim().length) {
				return false;
			}
	
			if (!serverURL.startsWith("https://") && !serverURL.startsWith("http://")) {
				return false;
			}
	
			const url = new URL(serverURL);
			if (!url.origin) {
				return false;
			}
			
			return true;
		}
		catch {
			return false;
		}
	}

	function isPasswordValid(password: string | undefined) {
		return (password?.length ?? 0) > 5
	}

	async function openMcpConfiguration() {
		downloading = true;
		try {
			initialServersSpecification = await downloadMCPServersSpecification();
			mcpConfigurationEditorOpen = true;
		} finally {
			downloading = false;
		}
	}

	// Rest handlers
	async function downloadMCPServersSpecification() {
		try {
			const res = await fetchAuthenticated("/mcp-config/servers-spec", {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					workspaceId: $selectedWorkspace?.id
				})
			});
			if (res.ok) {
				const data = await res.json();
				return JSON.stringify(data, null, 2);
			}
			console.error("Failed to download MCP servers specification");
		} catch (error) {
			console.error("Error downloading MCP servers specification:", error);
		}
		return "";
	}

	// Handlers
	function onDeclineChanges() {
		serverURL = mcpCredentials?.serverURL;
		draftSecretPassword = mcpCredentials?.secretPassword ?? "";
	}

	// Send credentials update to backend
	async function onAcceptChanges() {
		saving = true;
		try {
			const saveResponse = await fetchAuthenticated(
				"/mcp-config/credentials/change",
				{
					method: "PUT",
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						workspaceId: $selectedWorkspace?.id,
						credentials: {
							serverURL: serverURL,
							secretPassword: draftSecretPassword,
							workspaceId: $selectedWorkspace?.id ?? ""
						} satisfies MCPCredentialsBackendWithoutStatus
					})
				}
			);

			if (saveResponse.ok) {
				const { status } = await saveResponse.json() as {
					status: MCPConnectionStatusObject
				}

				// Setup new connection status
				connectionState = status;

				// Setup the initial properties to saved values
				mcpCredentials!.secretPassword = draftSecretPassword;
				mcpCredentials!.serverURL = serverURL;
				mcpCredentials!.status = status;
			}
			else {
				console.error('Cannot save credetials because of status: ', saveResponse.status);
				$alertState = {
					alert: {
						type: "error",
						name: "Cannot save MCP Credentials Changes",
						description: 'Cannot save credetials because of response-status: ' + saveResponse.status
					},
					timeoutMs: 5_000
				}
			}
		} finally {
			saving = false;
		}
	}
</script>

<div class="rounded-2xl bg-base-200 p-5 space-y-4">
	<div class="space-y-1">
		<h3 class="text-lg font-semibold">MCP Server</h3>
		<p class="text-sm text-base-content/70">
			Specify and configure your workspace MCP Server with list of allowed servers.
		</p>
	</div>

	<div class="space-y-2">
		<div class="rounded-xl border border-base-300 bg-base-100">
			<div class="flex items-center gap-2 px-3 py-2">
				<Icon icon="codicon:mcp" class="h-5 w-5 text-base-content/60" />

				<input
					class="input h-9 w-full border-none outline-none bg-transparent px-0 text-sm hover:border-none hover:outline-none"
					type="url"
					placeholder="MCP RavenOne Server-Middleware URL"
					bind:value={serverURL}
				/>

				<button 
					type="button"
					class="status-mcp-box button border p-2 h-full"
					class:connected-state={connectionState?.status === "connected"}
					class:invalid-state={connectionState?.status === "invalid-connection"}
					class:not-sepcified-connection={connectionState?.status === "not-specified" || !connectionState}
					title={connectionState?.status === "connected" ? "Connected" : connectionState?.status === "invalid-connection" ? "Invalid connection (Click for details)" : "Not specified"}
					onclick={() => {
						if (connectionState?.status === "invalid-connection") {
							invalidReasonModalOpen = true;
						}
					}}
				>
					{#if connectionState?.status === "connected"}
						<Icon icon="material-symbols:check"/>
					{:else if connectionState?.status === "invalid-connection"}
						<Icon icon="material-symbols:close-rounded"/>
					{:else}
						<Icon icon="material-symbols:text-decrease-rounded"/>
					{/if}
				</button>
			</div>
		</div>

		<div class="flex items-center justify-end px-1">
			<button
				class="btn btn-ghost btn-xs gap-1 normal-case"
				type="button"
				onclick={() => (setupModalOpen = true)}
			>
				<Icon icon="material-symbols:code-rounded" class="h-3.5 w-3.5" />
				Check how to setup
			</button>
		</div>
	</div>

    {#if serverURL && isServerURLValidState}
		<div class="space-y-2">
			<div class="rounded-xl border border-base-300 bg-base-100">
				<div class="flex items-center gap-2 px-3 py-2">
					<Icon icon="material-symbols:key-rounded" class="h-5 w-5 text-base-content/60" />

					<input
						class="input h-9 w-full border-none bg-transparent px-0 text-sm outline-none"
						type={revealSecretPassword ? "text" : "password"}
						placeholder="Secret password"
						bind:value={draftSecretPassword}
					/>

					<button
						class="btn btn-ghost btn-sm btn-square"
						type="button"
						title={revealSecretPassword ? "Hide password" : "Show password"}
						aria-label={revealSecretPassword ? "Hide password" : "Show password"}
						disabled={!draftSecretPassword.trim()}
						onclick={() => (revealSecretPassword = !revealSecretPassword)}
					>
						<Icon icon={revealSecretPassword ? "material-symbols:visibility-off-outline-rounded" : "material-symbols:visibility-outline-rounded"} class="h-4 w-4" />
					</button>
				</div>
			</div>

			<p class="px-1 text-xs text-base-content/60">
				* Secret password is required to allow communication with server. Pass this password to your server setup.
			</p>
		</div>
	{/if}

	{#if isServerURLValidState && isPasswordValidState && (mcpCredentials?.secretPassword && mcpCredentials.serverURL)}
		<button
			class="btn btn-neutral"
			type="button"
			title="Open MCP servers configuration"
			aria-label="Open MCP servers configuration"
			disabled={!isServerURLValidState || downloading}
			onclick={openMcpConfiguration}
		>
			{#if downloading}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			<Icon icon="material-symbols:settings-outline-rounded" class="h-4 w-4" />
			<span>Configure MCP Servers</span>
		</button>
	{/if}

	{#if isSomeValueChanged && isPasswordValidState && isServerURLValidState}
		<div
			class="flex justify-end gap-5"
		>
			<button 
				class="btn btn-ghost"
				onclick={onDeclineChanges}
				disabled={saving}
			>
				Decline
			</button>

			<button 
				class="btn btn-primary"
				onclick={onAcceptChanges}
				disabled={saving}
			>
				{#if saving}
					<span class="loading loading-spinner loading-sm"></span>
				{/if}
				Accept
			</button>
		</div>
	{/if}
</div>

<!-- Instructions modal -->
<UI.Modals.ModalWrapper
	name="MCP setup"
	size="2xl"
	bind:open={setupModalOpen}
>
	<UI.Modals.ModalWrapperHeading
		headingName="MCP server setup ideas"
		description="Use these steps to streamline your MCP server setup in this workspace."
		on:close={() => (setupModalOpen = false)}
	/>

	<div class="mt-3 space-y-3 text-sm text-base-content/80">
		<p>Step-by-step flow for this card:</p>
		<ol class="help-list list-decimal space-y-1 pl-5">
			{#each configurationSteps as step}
				<li>{@html step}</li>
			{/each}
		</ol>
	</div>

	<div class="modal-action">
		<button class="btn btn-primary" type="button" onclick={() => (setupModalOpen = false)}>
			Close
		</button>
	</div>
</UI.Modals.ModalWrapper>

<!-- Invalid Connection Reason Modal -->
<UI.Modals.ModalWrapper
	name="MCP connection error"
	size="md"
	bind:open={invalidReasonModalOpen}
>
	<UI.Modals.ModalWrapperHeading
		headingName="Connection Error"
		description="Details about the MCP server connection failure."
		on:close={() => (invalidReasonModalOpen = false)}
	/>

	<div class="mt-3 text-sm text-base-content/80 whitespace-pre-wrap rounded-xl border border-base-300 bg-base-200 p-3">
		{connectionState?.reason || "Unknown reason for connection failure."}
	</div>

	<div class="modal-action">
		<button class="btn btn-primary" type="button" onclick={() => (invalidReasonModalOpen = false)}>
			Close
		</button>
	</div>
</UI.Modals.ModalWrapper>

<!-- MCP Config modal -->
{#if mcpConfigurationEditorOpen}
	<McpSelectionModal
		bind:open={mcpConfigurationEditorOpen}
		mcpConfigurationDraft={initialServersSpecification}
		mcpConfigurationError=""
	/>
{/if}

<style>
	@reference "../../../app.css";

	.status-mcp-box.not-sepcified-connection {
		@apply bg-amber-500/30 border-amber-500;
	}

	.status-mcp-box.invalid-state {
		@apply bg-rose-500/30 border-rose-500;
	}

	.status-mcp-box.connected-state {
		@apply bg-emerald-500/30 border-emerald-500;
	}
</style>
