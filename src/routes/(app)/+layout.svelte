<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
    import { page } from '$app/stores';
    import SideStripe from '$lib/sideStripe/SideStripe.svelte';
	import SearchModal from '$lib/modals/SearchModal.svelte';
    import { isSharedRoute } from '$lib/stores/share';
    import RightStripeChat from '$lib/sideStripe/RightStripeChat.svelte';
    import { isChatSideStripeSelected } from '$lib/stores/selectedSideStripes';
    import { selectedFile } from '$lib/stores/files';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex h-screen w-screen overflow-hidden bg-base-100 text-base-content">
	<SideStripe/>
	
	<main class="relative flex-1 flex flex-col h-full min-w-0">
		{#if !$isSharedRoute}
			<SearchModal/>
		{/if}
		{@render children()}
	</main>

	{#if $isChatSideStripeSelected && $selectedFile}
		<RightStripeChat />
	{/if}
</div>
