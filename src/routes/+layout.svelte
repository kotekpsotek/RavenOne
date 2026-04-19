<script lang=ts>
    import WorkspaceTrayAndWrapper from "$lib/components/WorkspaceTrayAndWrapper.svelte";
    import { UI } from "@ravenlens/frontend";
	import '../app.css'; // Ensure tailwind is loaded

    let { children } = $props();
</script>

<!--  -->
<WorkspaceTrayAndWrapper/>
<UI.Common.AlertToast position="fixed"/>
{@render children()}
