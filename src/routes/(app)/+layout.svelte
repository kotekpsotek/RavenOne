<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
    import { page } from '$app/stores';
    import SideStripe from '$lib/sideStripe/SideStripe.svelte';
	import SearchModal from '$lib/modals/SearchModal.svelte';

	let { children } = $props();

    const isSharedRoute = $derived($page.url.pathname.startsWith('/share/'));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex h-screen w-screen overflow-hidden bg-base-100 text-base-content">
	<SideStripe isSharedView={isSharedRoute}/>
	
	<main class="relative flex-1 flex flex-col h-full min-w-0">
		{#if !isSharedRoute}
			<SearchModal/>
		{/if}
		{@render children()}
	</main>
</div>
