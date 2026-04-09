<script lang="ts">
    import { browser } from "$app/environment";
    import { UI } from "@ravenlens/frontend";
    import { File } from "@ravenlens/shared";
    import ModalScreen from "./ModalScreen.svelte";
    import { userProfile } from "$lib/stores/user";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { selectedFile } from "$lib/stores/files";
    import { alertState } from "$lib/utils/alert";
    import Icon from "@iconify/svelte";
    import CodeMirror from "svelte-codemirror-editor";
    import { json } from "@codemirror/lang-json";
    import { oneDark } from "@codemirror/theme-one-dark";
    import { theme } from "$lib/stores/theme";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import { selectedTab } from "$lib/stores/lists";
    import { PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL } from "$env/static/public";

    type SpikeWebhook = File.RoutinesSpikesConfig.SpikeConfigWebhook;
    type WebhookDraft = {
        name: string;
        webhookSchema: string;
        executeForSpecific: boolean;
    };

    type EditionResult = {
        id: string;
        savedAt: Date;
        summary: string;
        snapshot: {
            name: string;
            webhookSchema: string;
            executeForSpecific: boolean;
        };
    };

    let {
        open = $bindable(false)
    }: { open: boolean } = $props();

    let webhooks = $state<SpikeWebhook[]>([]);
    let loadingWebhooks = $state(false);
    let loadError = $state<string | null>(null);

    let editionWebhookId: string | undefined = $state(undefined);
    let draftByWebhookId = $state<Record<string, WebhookDraft>>({});
    let editionResultsByWebhookId = $state<Record<string, EditionResult[]>>({});
    let newWebHook: SpikeWebhook | undefined = $state(undefined);

    let loadRequestId = 0;

    $effect(() => {
        if (!open) {
            return;
        }

        void loadWebhooks();
    });

    function getPublicOrigin(): string {
        return browser ? window.location.origin : "http://localhost:5173";
    }

    function normalizeWebhookDate(webhook: SpikeWebhook): SpikeWebhook {
        return {
            ...webhook,
            createdAt: new Date(webhook.createdAt)
        };
    }

    function buildDefaultWebhookName(): string {
        const nextIndex = webhooks.length + 1;
        return `Webhook ${nextIndex}`;
    }

    function buildWebhookDraft(webhook: SpikeWebhook): WebhookDraft {
        return {
            name: webhook.name,
            webhookSchema: webhook.webhookSchema ?? "{\n\n}",
            executeForSpecific: webhook.executeFor !== "all"
        };
    }

    function getWebhookDraft(webhook: SpikeWebhook): WebhookDraft {
        return draftByWebhookId[webhook.webhookId] ?? buildWebhookDraft(webhook);
    }

    function setWebhookDraft(webhookId: string, update: Partial<WebhookDraft>) {
        const targetWebhook = webhooks.find((candidate) => candidate.webhookId === webhookId);
        if (!targetWebhook) {
            return;
        }

        const currentDraft = getWebhookDraft(targetWebhook);
        draftByWebhookId = {
            ...draftByWebhookId,
            [webhookId]: {
                ...currentDraft,
                ...update
            }
        };
    }

    function normalizeSchemaForCompare(raw: string | undefined): string {
        const trimmed = (raw ?? "").trim();
        if (!trimmed) {
            return "";
        }

        try {
            return JSON.stringify(JSON.parse(trimmed));
        }
        catch {
            return trimmed;
        }
    }

    function hasUnsavedChanges(webhook: SpikeWebhook): boolean {
        const draft = getWebhookDraft(webhook);
        return (
            draft.name.trim() !== webhook.name ||
            draft.executeForSpecific !== (webhook.executeFor !== "all") ||
            normalizeSchemaForCompare(draft.webhookSchema) !== normalizeSchemaForCompare(webhook.webhookSchema)
        );
    }

    function notifyInfo(name: string, description: string) {
        $alertState = {
            alert: {
                name,
                description,
                type: "info"
            },
            timeoutMs: 3_000
        };
    }

    function notifyWarning(name: string, description: string) {
        $alertState = {
            alert: {
                name,
                description,
                type: "warning"
            },
            timeoutMs: 3_000
        };
    }

    function notifyError(name: string, description: string) {
        $alertState = {
            alert: {
                name,
                description,
                type: "error"
            },
            timeoutMs: 4_000
        };
    }

    async function loadWebhooks() {
        const requestId = ++loadRequestId;
        loadingWebhooks = true;
        loadError = null;

        try {
            const downloaded = await downloadWebhooksConfig();
            if (requestId !== loadRequestId) {
                return;
            }

            webhooks = downloaded.map((webhook) => normalizeWebhookDate(webhook));
            editionWebhookId = undefined;
            draftByWebhookId = {};
            editionResultsByWebhookId = {};
            newWebHook = undefined;
        }
        catch {
            if (requestId !== loadRequestId) {
                return;
            }

            loadError = "Cannot load webhooks";
            webhooks = [];
        }
        finally {
            if (requestId === loadRequestId) {
                loadingWebhooks = false;
            }
        }
    }

    // Utils
    async function downloadWebhooksConfig(): Promise<SpikeWebhook[]> {
        // Download from backend service
        const workspaceId = $selectedWorkspace?.id ?? "test-workspace";
        const fileId = $selectedFile?.id ?? "test-file";
        const mode = $selectedTab.toLocaleLowerCase();

        try {
            const response = await fetchAuthenticated(`${PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL}/routines-spikes/${mode}/download-config`, {
                method: "POST",
                headers: {
                    'Content-Type': "application/json"
                },
                body: JSON.stringify({
                    workspaceId: workspaceId,
                    fileId: fileId
                })
            });

            if (response.ok) {
                const configWebhooks = await response.json() as SpikeWebhook[];
                return configWebhooks;
            }
        }
        catch(err) {
            console.error('Cannot download Webhooks config', err)
        }

        // Return when error
        return [];
    }

    function canSwitchEditTarget(nextWebhookId: string): boolean {
        if (!editionWebhookId || editionWebhookId === nextWebhookId) {
            return true;
        }

        const currentWebhook = webhooks.find((webhook) => webhook.webhookId === editionWebhookId);
        if (!currentWebhook || !hasUnsavedChanges(currentWebhook)) {
            return true;
        }

        return confirm("You have unsaved changes on another webhook. Discard them and continue?");
    }

    // TODO: Send to backend and retrive the generated webhooks id
    function onCreateWebhook() {
        if (!canSwitchEditTarget("")) {
            return;
        }

        const workspaceId = $selectedWorkspace?.id ?? "workspace";
        const fileId = $selectedFile?.id ?? "file";
        const webhookId = crypto.randomUUID();
        const createdWebhook: SpikeWebhook = {
            workspaceId,
            fileId,
            webhookId,
            webhookUrl: `${getPublicOrigin()}/api/spikes/webhooks/${webhookId}`,
            executeFor: "all",
            name: buildDefaultWebhookName(),
            webhookSchema: "{\n\n}",
            createdAt: new Date(),
            createdByAuthorId: $userProfile?.id ?? "anonymous-user"
        };

        webhooks = [createdWebhook, ...webhooks];
        draftByWebhookId = {
            ...draftByWebhookId,
            [webhookId]: buildWebhookDraft(createdWebhook)
        };

        newWebHook = createdWebhook;
        editionWebhookId = webhookId;
        notifyInfo("Webhook created", "New webhook is ready for editing.");
    }

    function onStartEditWebhook(webhook: SpikeWebhook) {
        return () => {
            if (webhook.webhookId === editionWebhookId) {
                if (hasUnsavedChanges(webhook)) {
                    const discard = confirm("Discard unsaved changes for this webhook?");
                    if (!discard) {
                        return;
                    }
                }

                editionWebhookId = undefined;
                return;
            }

            if (!canSwitchEditTarget(webhook.webhookId)) {
                return;
            }

            editionWebhookId = webhook.webhookId;
            draftByWebhookId = {
                ...draftByWebhookId,
                [webhook.webhookId]: getWebhookDraft(webhook)
            };
        };
    }

    // Handlers
    function onClose() {
        open = false;
    }

    function onCopyWebhookURL(webhook: SpikeWebhook) {
        return async () => {
            await navigator.clipboard.writeText(webhook.webhookUrl);
            notifyInfo("Webhook URL copied", "Webhook URL has been copied.");
        };
    }

    function resolveCodeMirrorPayload(payload: unknown): string {
        if (typeof payload === "string") {
            return payload;
        }

        if (payload && typeof payload === "object") {
            const valuePayload = payload as { value?: unknown; detail?: { value?: unknown } };
            const value = valuePayload.value ?? valuePayload.detail?.value;
            if (typeof value === "string") {
                return value;
            }
        }

        return String(payload ?? "");
    }

    function onSchemaCodeChange(webhookId: string, payload: unknown) {
        setWebhookDraft(webhookId, {
            webhookSchema: resolveCodeMirrorPayload(payload)
        });
    }

    function onToggleExecuteForSpecific(webhookId: string, checked: boolean) {
        setWebhookDraft(webhookId, {
            executeForSpecific: checked
        });

        if (checked) {
            notifyInfo("Specific execution enabled", "Choose lists/points support can be added next.");
        }
    }

    // TODO: Save to backend
    // TODO: Webhook has to be copied with secretValue to secure the webhook
    function onSaveEdition(webhook: SpikeWebhook) {
        return async () => {
            const draft = getWebhookDraft(webhook);
            const nextName = draft.name.trim();
            if (!nextName) {
                notifyWarning("Webhook name required", "Enter a webhook name before saving.");
                return;
            }

            const schemaRaw = draft.webhookSchema.trim();
            if (schemaRaw) {
                try {
                    JSON.parse(schemaRaw);
                }
                catch {
                    notifyError("Schema is invalid JSON", "Fix the schema JSON before saving.");
                    return;
                }
            }

            const nextWebhookSchema = schemaRaw
                ? JSON.stringify(JSON.parse(schemaRaw), null, 2)
                : undefined;

            const updatedWebhook: SpikeWebhook = {
                ...webhook,
                name: nextName,
                webhookSchema: nextWebhookSchema,
                executeFor: (draft.executeForSpecific ? "specific" : "all") as SpikeWebhook["executeFor"]
            };

            webhooks = webhooks.map((candidate) => {
                if (candidate.webhookId !== webhook.webhookId) {
                    return candidate;
                }

                return updatedWebhook;
            });

            draftByWebhookId = {
                ...draftByWebhookId,
                [webhook.webhookId]: buildWebhookDraft(updatedWebhook)
            };

            const editResult: EditionResult = {
                id: crypto.randomUUID(),
                savedAt: new Date(),
                summary: `${nextName} saved successfully`,
                snapshot: {
                    name: updatedWebhook.name,
                    webhookSchema: updatedWebhook.webhookSchema ?? "",
                    executeForSpecific: updatedWebhook.executeFor !== "all"
                }
            };

            editionResultsByWebhookId = {
                ...editionResultsByWebhookId,
                [webhook.webhookId]: [
                    editResult,
                    ...(editionResultsByWebhookId[webhook.webhookId] ?? [])
                ]
            };

            if (newWebHook?.webhookId === webhook.webhookId) {
                newWebHook = undefined;
            }

            editionWebhookId = undefined;
            notifyInfo("Webhook saved", "Edition result was recorded and can be edited again.");
        };
    }

    function onCancelEdition(webhook: SpikeWebhook) {
        return () => {
            if (hasUnsavedChanges(webhook)) {
                const discard = confirm("You have unsaved changes. Leave editing and discard them?");
                if (!discard) {
                    return;
                }
            }

            draftByWebhookId = {
                ...draftByWebhookId,
                [webhook.webhookId]: buildWebhookDraft(webhook)
            };

            if (newWebHook?.webhookId === webhook.webhookId) {
                newWebHook = undefined;
            }

            editionWebhookId = undefined;
        };
    }

    // TODO: Save to backend
    function onDeleteWebhook(webhook: SpikeWebhook) {
        return async () => {
            const confirmed = confirm(`Delete webhook "${webhook.name}"?`);
            if (!confirmed) {
                return;
            }

            webhooks = webhooks.filter((candidate) => candidate.webhookId !== webhook.webhookId);

            const { [webhook.webhookId]: removedDraft, ...remainingDrafts } = draftByWebhookId;
            void removedDraft;
            draftByWebhookId = remainingDrafts;

            const { [webhook.webhookId]: removedResults, ...remainingResults } = editionResultsByWebhookId;
            void removedResults;
            editionResultsByWebhookId = remainingResults;

            if (editionWebhookId === webhook.webhookId) {
                editionWebhookId = undefined;
            }

            if (newWebHook?.webhookId === webhook.webhookId) {
                newWebHook = undefined;
            }

            notifyInfo("Webhook deleted", "Webhook was removed successfully.");
        };
    }
</script>

<!--
    TODO:
    - wire backend endpoints for create/update/delete/list
    - implement concrete list/point selection when executeForSpecific is enabled
-->
{#snippet WebhookCard(webhook: SpikeWebhook)}
    {@const draft = getWebhookDraft(webhook)}
    {@const webhookInEdit = webhook.webhookId === editionWebhookId}
    <div
        class="flex flex-col gap-3 p-2 rounded-lg border border-base-300 bg-base-200 {webhookInEdit ? 'scale-[1.02] shadow-lg border-primary theme-dark:shadow-white/20' : ''}"
        id="webhookCard"
        data-webhook-id={webhook.webhookId}
    >
        <div class="name-autor-date">
            <div class="flex gap-2 justify-between items-center">
                {#if webhookInEdit}
                    <input
                        class="input input-sm bg-transparent border-none outline-none text-lg font-semibold px-0 w-3/4"
                        value={draft.name}
                        placeholder="Webhook Name"
                        oninput={(event) => {
                            setWebhookDraft(webhook.webhookId, {
                                name: (event.currentTarget as HTMLInputElement).value
                            });
                        }}
                    />
                {:else}
                    <p class="font-semibold text-lg">{webhook.name}</p>
                {/if}

                {#if !webhookInEdit}
                    <button
                        class="btn btn-xs btn-ghost"
                        onclick={onStartEditWebhook(webhook)}
                        title="Edit Webhook"
                    >
                        <Icon icon="material-symbols:edit" />
                    </button>
                {:else}
                    <button
                        class="btn btn-xs btn-ghost"
                        onclick={onCancelEdition(webhook)}
                        title="Stop editing"
                        aria-label="Stop editing"
                    >
                        <Icon icon="material-symbols:close-rounded" />
                    </button>
                {/if}
            </div>
            <p class="text-gray-400 text-sm">
                Created on <span class="font-semibold">{webhook.createdAt.toLocaleDateString()}</span>
            </p>
        </div>

        <!-- FIXME: Add this feature in the after mvp nth version -->
        <!-- <div class="flex flex-col gap-2.5 border-t border-gray-200 pt-4">
            <label class="label text-sm">
                <input
                    type="checkbox"
                    disabled={!webhookInEdit}
                    checked={draft.executeForSpecific}
                    class="checkbox checkbox-sm"
                    onchange={(event) => {
                        onToggleExecuteForSpecific(
                            webhook.webhookId,
                            (event.currentTarget as HTMLInputElement).checked
                        );
                    }}
                />

                Execute for specific lists (and) points
            </label>

            {#if draft.executeForSpecific}
                <div class="text-xs text-base-content/70 rounded-lg bg-base-300/50 p-2">
                    Specific target selection is currently stored as edition intent.
                </div>
            {/if}
        </div> -->

        <div id="spikeSchema" class="flex flex-col gap-2">
            <div class="">
                <p class="font-semibold text-[15px] text-black">Payload Schema</p>
                <p class="text-sm text-gray-500">Specify Payload schema as description for payload deliver with WebHook Request</p>
            </div>
            
            <CodeMirror
                class="code-mirror-of-code-snippet"
                value={draft.webhookSchema || `{}`}
                editable={webhookInEdit}
                lang={json()}
                theme={$theme === "dark" ? oneDark : undefined}
                onchange={(value) => onSchemaCodeChange(webhook.webhookId, value)}
                styles={{
                    "&": {
                        fontSize: "15px",
                        lineHeight: "1.5"
                    }
                }}
            />

            <p class="text-[11px]">* It's to be <b>JSON compilant payload</b></p>
        </div>

        <div class="flex gap-5 items-center justify-between border-t border-gray-200 pt-4 mt-2">
            <div class="flex gap-3 items-center">
                <button class="btn btn-sm btn-outline" onclick={onCopyWebhookURL(webhook)}>
                    Copy URL Address
                </button>

                <button class="btn btn-sm btn-error" onclick={onDeleteWebhook(webhook)}>
                    Delete Webhook
                </button>
            </div>

            {#if webhookInEdit && hasUnsavedChanges(webhook)}
                <div class="flex gap-2 items-center">
                    <button class="btn btn-sm btn-success" onclick={onSaveEdition(webhook)}>
                        Save
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/snippet}

<ModalScreen bind:open>
    <UI.Modals.ModalWrapper
        name="Spikes Config"
        bind:open
        closeOnBackdrop={true}
        size={{ custom: "max-w-1/2" }}
        on:close={onClose}
    >
        <UI.Modals.ModalWrapperHeading
            headingName="Spikes Config"
            description="Call the webhooks with REST to execute the Spikes"
            on:close={onClose}
        />

        <div class="max-h-[80vh] p-4 overflow-y-auto pr-1 flex flex-col">
            {#if loadingWebhooks}
                <div class="loading">
                    <span class="loading-spinner loading-sm"></span>
                    <span>Loading Webhooks...</span>
                </div>
            {:else if loadError}
                <div class="flex items-center justify-center w-full h-full">
                    <p class="text-error">{loadError}</p>
                </div>
            {:else}
                <button
                    class="btn btn-sm btn-outline theme-dark:border-white theme-dark:text-white btn-primary w-fit flex gap-2"
                    onclick={onCreateWebhook}
                >
                    <Icon icon="material-symbols:webhook-rounded" />
                    <span>New Webhook</span>
                </button>

                <div class="webhook-list mt-5 flex flex-col gap-7 overflow-auto p-2">
                    {#if webhooks.length}
                        {#each webhooks as webhook (webhook.webhookId)}
                            {@render WebhookCard(webhook)}
                        {/each}
                    {:else}
                        <div class="rounded-lg border border-dashed border-base-300 p-5 text-sm text-base-content/70">
                            No webhooks configured yet. Create your first webhook.
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </UI.Modals.ModalWrapper>
</ModalScreen>

<style>
    .webhook-list {
        scrollbar-width: none;
        -ms-overflow-style: none;
    }

    .webhook-list::-webkit-scrollbar {
        display: none;
    }
</style>
