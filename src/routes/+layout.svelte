<script lang=ts>
    import AlertToast from "$lib/AlertToast.svelte";
    import WorkspaceTrayAndWrapper from "$lib/components/WorkspaceTrayAndWrapper.svelte";
    import OfflineBanner from "$lib/offline/OfflineBanner.svelte";
	import '../app.css'; // Ensure tailwind is loaded

    let { children } = $props();
</script>

<!--  -->
<OfflineBanner/>
<WorkspaceTrayAndWrapper/>
<AlertToast/>
{@render children()}
