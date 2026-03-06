<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
    import SideStripe from '$lib/sideStripe/SideStripe.svelte';
	import SearchModal from '$lib/modals/SearchModal.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex h-screen w-screen overflow-hidden bg-base-100 text-base-content">
	<SideStripe/>
	
	<main class="relative flex-1 flex flex-col h-full min-w-0">
		<SearchModal/>
		{@render children()}
	</main>
</div>
