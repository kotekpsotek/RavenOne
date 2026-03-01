<script lang="ts">
    import MainSectionArea from "$lib/MainSectionArea.svelte";
    import MainUpperStripe from "$lib/MainUpperStripe.svelte";
</script>

<div class="flex h-full w-full flex-col min-h-0">
	<MainUpperStripe/>
	<div class="flex-1 min-h-0">
		<MainSectionArea/>
	</div>
</div>
