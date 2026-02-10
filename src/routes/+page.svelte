<script lang="ts">
	import Editor from '$lib/components/Editor.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
</script>

<div class="flex flex-col h-full w-full">
	<TopBar />
	<div class="flex-1 min-h-0 bg-base-100">
		<Editor />
	</div>
</div>
