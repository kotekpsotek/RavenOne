<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css'; // Ensure tailwind is loaded
	import Sidebar from '$lib/components/Sidebar.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex h-screen w-screen overflow-hidden bg-base-100 text-base-content">
	<Sidebar />
	<main class="flex-1 flex flex-col h-full min-w-0">
		{@render children()}
	</main>
</div>
