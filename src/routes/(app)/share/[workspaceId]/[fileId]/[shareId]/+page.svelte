<script lang="ts">
    import MainSectionArea from "$lib/MainSectionArea.svelte";
    import { editor } from "$lib/stores/editor";
    import { entriesList, isSearchModalOpen, selectedFile } from "$lib/stores/files";
    import { isWorkspaceSelectionOpen, selectedWorkspace } from "$lib/stores/workspace";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    $effect(() => {
        selectedWorkspace.selectWorkspace(data.workspace);
        entriesList.set([data.file]);
        selectedFile.set(data.file);
        isSearchModalOpen.set(false);
        isWorkspaceSelectionOpen.set(false);
    });

    editor.subscribe(ed => {
        if (ed) {
            ed.setEditable(false);
        }
    })
</script>

<div class="flex h-full min-h-0 w-full flex-col">
    <header class="border-b border-base-300 bg-base-100 px-4 py-2">
        <p class="text-xs uppercase tracking-wide opacity-60">Shared file preview</p>
        <h1 class="truncate text-base font-semibold">{data.file.name}</h1>
    </header>

    <div class="flex-1 min-h-0">
        <MainSectionArea />
    </div>
</div>
