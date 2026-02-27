<script lang="ts">
    import Icon from "@iconify/svelte";
    import { onDestroy } from "svelte";
    import { alertState, type Alert } from "$lib/utils/alert";

    let dismissTimer: ReturnType<typeof setTimeout> | undefined;

    const defaultTypeClass: Record<NonNullable<Alert["type"]>, string> = {
        success: "alert-success",
        warning: "alert-warning",
        info: "alert-info",
        error: "alert-error"
    };

    const defaultTypeIcon: Record<NonNullable<Alert["type"]>, string> = {
        success: "material-symbols:check-circle-rounded",
        warning: "material-symbols:warning-rounded",
        info: "material-symbols:info-rounded",
        error: "material-symbols:error-rounded"
    };

    function closeAlert() {
        alertState.set(undefined);
    }

    function onActionClick(onClick: () => void) {
        onClick();
        closeAlert();
    }

    const unsubscribe = alertState.subscribe((currentAlert) => {
        if (dismissTimer) {
            clearTimeout(dismissTimer);
            dismissTimer = undefined;
        }

        if (!currentAlert) {
            return;
        }

        const timeoutMs = Number(currentAlert.timeoutMs);
        if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
            dismissTimer = setTimeout(() => {
                alertState.set(undefined);
            }, timeoutMs);
        }
    });

    onDestroy(() => {
        unsubscribe();
        if (dismissTimer) {
            clearTimeout(dismissTimer);
            dismissTimer = undefined;
        }
    });
</script>

{#if $alertState}
    <div class="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4">
        <div
            class={`alert pointer-events-auto max-w-2xl shadow-lg ${$alertState.alert.classStyle ?? defaultTypeClass[$alertState.alert.type ?? "info"]}`}
            role="alert"
            aria-live="polite"
        >
            <Icon
                icon={$alertState.alert.icon ?? defaultTypeIcon[$alertState.alert.type ?? "info"]}
                class="h-5 w-5"
            />
            <div class="min-w-0">
                <h3 class="font-semibold">{$alertState.alert.name}</h3>
                {#if $alertState.alert.description}
                    <p class="text-sm opacity-90">{$alertState.alert.description}</p>
                {/if}
            </div>

            <div class="flex items-center gap-2">
                {#if $alertState.alert.btns?.length}
                    {#each $alertState.alert.btns as btn (btn.name)}
                        <button
                            type="button"
                            class={`btn btn-xs ${btn.classStyle}`}
                            onclick={() => onActionClick(btn.onClick)}
                        >
                            {btn.name}
                        </button>
                    {/each}
                {/if}

                <button
                    type="button"
                    class="btn btn-ghost btn-xs btn-circle"
                    onclick={closeAlert}
                    aria-label="Close alert"
                    title="Close"
                >
                    <Icon icon="material-symbols:close-rounded" class="h-4 w-4" />
                </button>
            </div>
        </div>
    </div>
{/if}