<script lang=ts>
    import AlertToast from "$lib/AlertToast.svelte";
	import '../app.css'; // Ensure tailwind is loaded

    let { children } = $props();
</script>

<AlertToast/>
{@render children()}
