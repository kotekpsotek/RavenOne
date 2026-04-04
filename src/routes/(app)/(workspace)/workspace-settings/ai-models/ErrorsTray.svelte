<script lang="ts">
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { fetchAuthenticated } from "$lib/utils/fetch";
    import { onMount } from "svelte";
    import { handleGetJWT, handleGetSelectedWorkspace } from "./common";
    import Icon from "@iconify/svelte";

    // State
    type LLMErrorRecord = Record<string, unknown>;

    let llmErrors = $state<LLMErrorRecord[]>([]);
    let llmErrorsLastWorkspaceId: string | null = null;
    let isLoadingLLMErrors = $state(false);
    let isClearingLLMErrors = $state(false);
    let llmErrorsLoadError = $state("");
    let llmErrorsClearError = $state("");
    let llmErrorsNotice = $state("");

    // Utils
    function toErrorMessage(error: unknown) {
        if (error instanceof Error && error.message) {
            return error.message;
        }

        return "Request failed";
    }

    function toSafeRecord(value: unknown): LLMErrorRecord | null {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return null;
        }

        return value as LLMErrorRecord;
    }

    function formatCreatedAt(item: LLMErrorRecord) {
        const raw = item.creationDate ?? item.createdAt ?? item.date ?? item.timestamp;

        if (typeof raw !== "string" && typeof raw !== "number") {
            return "Unknown date";
        }

        const createdAt = new Date(raw);
        if (Number.isNaN(createdAt.getTime())) {
            return "Unknown date";
        }

        return createdAt.toLocaleString();
    }

    function formatErrorName(item: LLMErrorRecord) {
        return typeof item.name === "string" && item.name.trim()
            ? item.name
            : "Unnamed error";
    }

    function formatErrorDescription(item: LLMErrorRecord) {
        return typeof item.description === "string" && item.description.trim()
            ? item.description
            : "No description available.";
    }

    function getLLMErrorKey(item: LLMErrorRecord, index: number) {
        const candidate = item.id ?? item._id ?? item.creationDate ?? index;

        if (typeof candidate === "string" || typeof candidate === "number") {
            return candidate;
        }

        return `llm-error-${index}`;
    }

    // Handlers
    async function onRetriveErrorsList() {
        const workspace = handleGetSelectedWorkspace();
        const jwt = handleGetJWT();

        llmErrorsLoadError = "";
        llmErrorsClearError = "";
        llmErrorsNotice = "";
        isLoadingLLMErrors = true;

        try {
            const response = await fetchAuthenticated("/llm-errors/download-llm-errors", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ workspaceId: workspace.id })
            }, jwt);

            if (!response.ok) {
                throw new Error(`Failed to download LLM errors (${response.status})`);
            }

            const responseBody = await response.json() as unknown;
            const normalizedErrors = Array.isArray(responseBody)
                ? responseBody.map(toSafeRecord).filter((item): item is LLMErrorRecord => item !== null)
                : [];

            llmErrors = normalizedErrors;
        } catch (error: unknown) {
            llmErrors = [];
            llmErrorsLoadError = toErrorMessage(error);
        } finally {
            isLoadingLLMErrors = false;
        }
    }

    async function onClearErrors() {
        const workspace = handleGetSelectedWorkspace();
        const jwt = handleGetJWT();

        llmErrorsClearError = "";
        llmErrorsNotice = "";
        isClearingLLMErrors = true;

        try {
            const response = await fetchAuthenticated("/llm-errors/clear-llm-errors", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ workspaceId: workspace.id })
            }, jwt);

            if (!response.ok) {
                throw new Error(`Failed to clear LLM errors (${response.status})`);
            }

            llmErrors = [];
            llmErrorsNotice = "All LLM errors were cleared.";
        } catch (error: unknown) {
            llmErrorsClearError = toErrorMessage(error);
        } finally {
            isClearingLLMErrors = false;
        }
    }

    onMount(() => {
        const unsubscribe = selectedWorkspace.subscribe((workspace) => {
            const currentWorkspaceId = workspace?.id ?? null;

            if (!currentWorkspaceId) {
                llmErrorsLastWorkspaceId = null;
                llmErrors = [];
                llmErrorsLoadError = "";
                llmErrorsClearError = "";
                llmErrorsNotice = "";
                return;
            }

            if (currentWorkspaceId !== llmErrorsLastWorkspaceId) {
                llmErrorsLastWorkspaceId = currentWorkspaceId;
                void onRetriveErrorsList();
            }
        });

        return unsubscribe;
    });
</script>

<section class="bg-base-200 rounded-2xl p-5 space-y-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="space-y-1">
            <h3 class="text-base font-bold">LLM Errors</h3>
            <p class="text-base-content/50 text-sm">
                Download all workspace LLM errors and clear them when needed.
            </p>
        </div>

        <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
                class="btn btn-outline btn-sm flex gap-1 items-center"
                onclick={onRetriveErrorsList}
                disabled={isLoadingLLMErrors}
            >
                {#if isLoadingLLMErrors}
                    <span class="loading-spinner loading-sm"></span>
                    <span>
                        Downloading...
                    </span>
                {:else}
                    <Icon icon="material-symbols:clock-loader-60-sharp"/>
                    <span>Reload</span>
                {/if}
            </button>

            <button
                class="btn btn-error btn-sm text-white"
                onclick={onClearErrors}
                disabled={isClearingLLMErrors || llmErrors.length === 0}
            >
                {isClearingLLMErrors ? "Clearing..." : "Clear All"}
            </button>
        </div>
    </div>

    {#if llmErrorsLoadError}
        <p class="mt-3 text-sm text-error">{llmErrorsLoadError}</p>
    {/if}

    {#if llmErrorsClearError}
        <p class="mt-2 text-sm text-error">{llmErrorsClearError}</p>
    {/if}

    {#if llmErrorsNotice}
        <p class="mt-2 text-sm text-success">{llmErrorsNotice}</p>
    {/if}

    {#if isLoadingLLMErrors}
        <div class="mt-4 rounded-lg border border-base-300 bg-base-100 p-4 text-sm opacity-75">
            Loading error logs...
        </div>
    {:else if llmErrors.length === 0}
        <div class="mt-4 rounded-lg border border-dashed border-base-300 bg-base-100 p-4 text-sm opacity-75">
            No LLM errors found for this workspace.
        </div>
    {:else}
        <div class="mt-4 grid grid-cols-1 gap-3">
            {#each llmErrors as llmError, index (getLLMErrorKey(llmError, index))}
                <article class="rounded-lg border border-base-300 bg-rose-100 theme-dark:bg-red-400/50 p-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="badge badge-outline badge-sm">Error #{index + 1}</span>
                        <span class="text-xs opacity-70">{formatCreatedAt(llmError)}</span>
                    </div>

                    <p class="text-lg font-medium break-words mt-2">{formatErrorName(llmError)}</p>

                    <p class="text-sm whitespace-pre-wrap break-words text-base-content/70">{formatErrorDescription(llmError)}</p>
                </article>
            {/each}
        </div>
    {/if}
</section>