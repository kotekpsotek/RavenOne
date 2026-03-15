<script lang="ts">
	import { browser } from "$app/environment";
	import { mcpConfigurationStore, selectedMcpServers } from "$lib/stores/mcpConfig";
	import Icon from "@iconify/svelte";
	import { UI } from "@ravenlens/frontend";
	import { get } from "svelte/store";
	import McpSelectionModal from "$lib/modals/McpSelectionModal.svelte";

	const MCP_SERVER_URL_STORAGE_KEY = "ravenone:mcp-server-url";
	const MCP_SERVER_SECRET_STORAGE_KEY = "ravenone:mcp-server-secret";

	type ConnectionStatus = "idle" | "ok" | "error";
	type ConnectionCheckResult = {
		valid: boolean;
		reason: string;
	};

	let mcpServerUrl = $state("");
	let secretPassword = $state("");
	let draftSecretPassword = $state("");
	let revealSecretPassword = $state(false);

	let connectionStatus = $state<ConnectionStatus>("idle");
	let connectionStatusReason = $state("Specify MCP Server URL and run check.");

	let setupModalOpen = $state(false);
	let statusModalOpen = $state(false);
	let secretEditModalOpen = $state(false);
	let mcpConfigurationEditorOpen = $state(false);

	let mcpConfigurationDraft = $state(get(mcpConfigurationStore));
	let mcpConfigurationError = $state("");

	const hasValidConnection = $derived(connectionStatus === "ok");
	const statusLabel = $derived(connectionStatus === "ok"
		? "Connected"
		: connectionStatus === "error"
			? "Needs attention"
			: "Not checked");
	const statusAlertClass = $derived(connectionStatus === "ok"
		? "alert-success"
		: connectionStatus === "error"
			? "alert-error"
			: "alert-info");
	const statusIcon = $derived(connectionStatus === "ok"
		? "material-symbols:check-circle-rounded"
		: connectionStatus === "error"
			? "material-symbols:error-rounded"
			: "material-symbols:info-rounded");
	const configurationSummary = $derived(hasValidConnection
		? ($selectedMcpServers.length > 0
			? `${$selectedMcpServers.length} MCP server(s) configured and ready.`
			: "Connection verified. Configure at least one MCP server.")
		: "MCP server is not configured yet. Run connection check and then configure servers.");

	if (browser) {
		mcpServerUrl = localStorage.getItem(MCP_SERVER_URL_STORAGE_KEY) ?? "";
		secretPassword = localStorage.getItem(MCP_SERVER_SECRET_STORAGE_KEY) ?? "";
	}

	function persistServerUrl() {
		if (!browser) {
			return;
		}

		localStorage.setItem(MCP_SERVER_URL_STORAGE_KEY, mcpServerUrl);
	}

	function persistSecretPassword() {
		if (!browser) {
			return;
		}

		localStorage.setItem(MCP_SERVER_SECRET_STORAGE_KEY, secretPassword);
	}

	function validateMcpServerUrl(urlValue: string): ConnectionCheckResult {
		if (!urlValue.trim()) {
			return {
				valid: false,
				reason: "MCP Server URL is missing. Provide a URL before checking connection."
			};
		}

		try {
			const parsedUrl = new URL(urlValue);

			if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
				return {
					valid: false,
					reason: "MCP Server URL must use http:// or https:// protocol."
				};
			}

			return {
				valid: true,
				reason: `Connection URL format is valid: ${parsedUrl.origin}`
			};
		} catch {
			return {
				valid: false,
				reason: "MCP Server URL has invalid format. Example: https://mcp.yourdomain.com"
			};
		}
	}

	function checkConnectionStatus() {
		const result = validateMcpServerUrl(mcpServerUrl);

		connectionStatus = result.valid ? "ok" : "error";
		connectionStatusReason = result.reason;
		persistServerUrl();
		statusModalOpen = true;
	}

	function openMcpConfiguration() {
		if (!hasValidConnection) {
			connectionStatus = "error";
			connectionStatusReason = "MCP servers configuration is enabled only after successful URL check.";
			statusModalOpen = true;
			return;
		}

		mcpConfigurationDraft = $mcpConfigurationStore;
		mcpConfigurationError = "";
		mcpConfigurationEditorOpen = true;
	}

	function openSecretEditor() {
		draftSecretPassword = secretPassword;
		secretEditModalOpen = true;
	}

	function closeSecretEditor() {
		draftSecretPassword = secretPassword;
		secretEditModalOpen = false;
	}

	function acceptSecretEdit() {
		secretPassword = draftSecretPassword.trim();
		persistSecretPassword();
		secretEditModalOpen = false;
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
				<Icon icon="material-symbols:link-rounded" class="h-5 w-5 text-base-content/60" />

				<input
					class="h-9 w-full border-none bg-transparent px-0 text-sm outline-none"
					type="url"
					placeholder="MCP Server URL"
					bind:value={mcpServerUrl}
				/>

				<button
					class="btn btn-ghost btn-sm btn-square"
					type="button"
					title="Open MCP servers configuration"
					aria-label="Open MCP servers configuration"
					disabled={!hasValidConnection}
					onclick={openMcpConfiguration}
				>
					<Icon icon="material-symbols:settings-outline-rounded" class="h-4 w-4" />
				</button>

				<button
					class="btn btn-sm btn-square {hasValidConnection ? 'btn-success text-success-content' : connectionStatus === 'error' ? 'btn-error text-error-content' : 'btn-ghost'}"
					type="button"
					title="Check MCP server connection"
					aria-label="Check MCP server connection"
					onclick={checkConnectionStatus}
				>
					<Icon icon="material-symbols:check-rounded" class="h-4 w-4" />
				</button>
			</div>
		</div>

		<div class="flex items-center justify-between px-1">
			<button
				class="btn btn-ghost btn-xs gap-1 normal-case"
				type="button"
				onclick={() => (setupModalOpen = true)}
			>
				<Icon icon="material-symbols:code-rounded" class="h-3.5 w-3.5" />
				Check how to setup
			</button>

			<button
				class="badge badge-outline h-7 gap-1 px-2 hover:border-primary/60"
				type="button"
				title="Open status details"
				aria-label="Open status details"
				onclick={() => (statusModalOpen = true)}
			>
				<Icon
					icon={statusIcon}
					class="h-3.5 w-3.5 {connectionStatus === 'ok' ? 'text-success' : connectionStatus === 'error' ? 'text-error' : 'text-info'}"
				/>
				{statusLabel}
			</button>
		</div>
	</div>

	<div class="space-y-2">
		<div class="rounded-xl border border-base-300 bg-base-100">
			<div class="flex items-center gap-2 px-3 py-2">
				<Icon icon="material-symbols:key-rounded" class="h-5 w-5 text-base-content/60" />

				<input
					class="h-9 w-full border-none bg-transparent px-0 text-sm outline-none"
					type={revealSecretPassword ? "text" : "password"}
					placeholder="Secret password"
					readonly
					value={secretPassword}
				/>

				<button
					class="btn btn-ghost btn-sm btn-square"
					type="button"
					title={revealSecretPassword ? "Hide password" : "Show password"}
					aria-label={revealSecretPassword ? "Hide password" : "Show password"}
					disabled={!secretPassword}
					onclick={() => (revealSecretPassword = !revealSecretPassword)}
				>
					<Icon icon={revealSecretPassword ? "material-symbols:visibility-off-outline-rounded" : "material-symbols:visibility-outline-rounded"} class="h-4 w-4" />
				</button>

				<button
					class="btn btn-ghost btn-sm btn-square"
					type="button"
					title="Edit secret password"
					aria-label="Edit secret password"
					onclick={openSecretEditor}
				>
					<Icon icon="material-symbols:edit-square-outline-rounded" class="h-4 w-4" />
				</button>
			</div>
		</div>

		<p class="px-1 text-xs text-base-content/60">
			* Secret password is required to allow communication with server. Pass this password to your server setup.
		</p>
	</div>

	<div class="rounded-xl border border-dashed border-base-300 bg-base-100 px-3 py-2">
		<p class="text-xs text-base-content/70">{configurationSummary}</p>
	</div>
</div>

<UI.Modals.ModalWrapper
	name="MCP setup"
	size="lg"
	bind:open={setupModalOpen}
>
	<UI.Modals.ModalWrapperHeading
		headingName="MCP server setup ideas"
		description="Use these steps to streamline your MCP server setup in this workspace."
		on:close={() => (setupModalOpen = false)}
	/>

	<div class="mt-3 space-y-3 text-sm text-base-content/80">
		<p>Step-by-step flow for this card:</p>
		<ol class="list-decimal space-y-1 pl-5">
			<li>Provide MCP Server URL and run connection check.</li>
			<li>Open status details to review validation reason.</li>
			<li>Set your secret password and accept password edit.</li>
			<li>Open MCP servers configuration and accept your JSON setup.</li>
		</ol>
		<div class="rounded-xl border border-base-300 bg-base-200 p-3 text-xs">
			The same status modal is used for both connection success and connection errors.
		</div>
	</div>

	<div class="modal-action">
		<button class="btn btn-primary" type="button" onclick={() => (setupModalOpen = false)}>
			Close
		</button>
	</div>
</UI.Modals.ModalWrapper>

<UI.Modals.ModalWrapper
	name="MCP connection status"
	size="md"
	bind:open={statusModalOpen}
>
	<UI.Modals.ModalWrapperHeading
		headingName="MCP connection status"
		on:close={() => (statusModalOpen = false)}
	/>

	<div class="mt-3 alert {statusAlertClass}">
		<Icon icon={statusIcon} class="h-5 w-5" />
		<span>{connectionStatusReason}</span>
	</div>

	<div class="modal-action">
		<button class="btn btn-primary" type="button" onclick={() => (statusModalOpen = false)}>
			Close
		</button>
	</div>
</UI.Modals.ModalWrapper>

<UI.Modals.ModalWrapper
	name="Edit secret password"
	size="lg"
	bind:open={secretEditModalOpen}
>
	<UI.Modals.ModalWrapperHeading
		headingName="Edit secret password"
		description="Click Accept to save the password for this workspace browser session."
		on:close={closeSecretEditor}
	/>

	<div class="mt-3 space-y-2">
		<label class="text-sm font-medium text-base-content/80" for="mcp-secret-password">
			Secret password
		</label>
		<input
			id="mcp-secret-password"
			class="input input-bordered w-full"
			type="password"
			placeholder="Enter secret password"
			bind:value={draftSecretPassword}
		/>
		<p class="text-xs text-base-content/60">
			Share this password in your MCP server setup so only allowed clients can communicate.
		</p>
	</div>

	<div class="modal-action">
		<button class="btn btn-ghost" type="button" onclick={closeSecretEditor}>Cancel</button>
		<button
			class="btn btn-primary"
			type="button"
			onclick={acceptSecretEdit}
			disabled={!draftSecretPassword.trim()}
		>
			Accept
		</button>
	</div>
</UI.Modals.ModalWrapper>

<McpSelectionModal
	bind:open={mcpConfigurationEditorOpen}
	bind:mcpConfigurationDraft
	bind:mcpConfigurationError
/>
