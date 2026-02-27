<script lang="ts">
    import { userProfile } from "$lib/stores/user";
    import type { Snippet } from "svelte";
    import type { Profile } from "@ravenlens/shared";

    let { children }: { children: Snippet<[Profile]> } = $props();

    // State
    let isProfileErrorVisible = $state(true);

    // Helpers
    function toErrorMessage(err: unknown): string {
        if (err instanceof Error) return err.message;
        if (typeof err === "string") return err;
        try {
            return JSON.stringify(err);
        } catch {
            return String(err);
        }
    }
</script>

{#await userProfile.download()}
    <div
        class="absolute top-4 right-4 z-40 flex items-center gap-3 rounded-box border border-base-300 bg-base-200/80 px-4 py-2 backdrop-blur-md"
        aria-live="polite"
    >
        <span class="loading loading-spinner loading-sm" aria-label="Loading"></span>
        <span class="text-sm font-medium opacity-80">Loading profile…</span>
    </div>
{:then profile} 
    {@render children(profile)}
{:catch err}
    {#if isProfileErrorVisible}
        <div class="absolute top-4 right-4 z-40 max-w-xl">
            <div class="alert alert-error shadow-lg">
                <div class="flex flex-col gap-0.5">
                    <div class="font-semibold">Couldn’t load your profile</div>
                    <div class="text-sm opacity-80 break-words">{toErrorMessage(err)}</div>
                </div>
                <button
                    class="btn btn-ghost btn-sm"
                    aria-label="Dismiss error"
                    onclick={() => (isProfileErrorVisible = false)}
                >
                    ✕
                </button>
            </div>
        </div>
    {/if}
{/await}