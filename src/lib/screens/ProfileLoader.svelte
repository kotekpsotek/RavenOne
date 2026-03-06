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

{@render children($userProfile!)}
