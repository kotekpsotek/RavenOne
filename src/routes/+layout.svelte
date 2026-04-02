<script lang=ts>
    import { dev } from "$app/environment";
    import AlertToast from "$lib/AlertToast.svelte";
    import WorkspaceTrayAndWrapper from "$lib/components/WorkspaceTrayAndWrapper.svelte";
    import { entriesList } from "$lib/stores/files";
    import { userProfile } from "$lib/stores/user";
	import '../app.css'; // Ensure tailwind is loaded

    let { children } = $props();

    // FIXME: Tests
    if (dev) {
        setTimeout(() => {
            $entriesList = [
                ...$entriesList,
                {
                type: "file",
                    subkind: "ravencode",
                    id: "unique-name",
                    name: "RavenCode file",
                    content: "<p>Test</p>",
                    lists: [],
                    createdAt: new Date(),
                    createdByAuthorId: $userProfile?.id ?? "unknown",
                }
            ]
        }, 1000)
    }
</script>

<!--  -->
<WorkspaceTrayAndWrapper/>
<AlertToast/>
{@render children()}
