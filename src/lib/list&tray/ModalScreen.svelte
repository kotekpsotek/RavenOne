<script lang="ts">
    export let open = false;
</script>

{#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="w-full fixed inset-0 z-[80] bg-black/40" onclick={() => open = false}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="w-full flex min-h-full items-center justify-center p-4" onclick={(event) => event.stopPropagation()}>
            <slot/>
        </div>
    </div>
{/if}
