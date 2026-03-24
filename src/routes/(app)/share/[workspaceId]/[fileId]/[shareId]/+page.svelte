<script lang="ts">
    import { goto } from "$app/navigation";
    import MainSectionArea from "$lib/MainSectionArea.svelte";
    import { editor } from "$lib/stores/editor";
    import { entriesList, isSearchModalOpen, selectedFile } from "$lib/stores/files";
    import { isWorkspaceSelectionOpen, selectedWorkspace } from "$lib/stores/workspace";
    import { JWTAuth } from "$lib/utils/auth";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    $effect(() => {
        selectedWorkspace.set(data.workspace);
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

    async function onViewAsMember() {
        const token = JWTAuth.getToken();
        if (!token) {
            return;
        }

        selectedWorkspace.set(data.workspace);

        const targetFileId = data.file.id?.trim();
        const route = targetFileId
            ? `/?selectFileId=${encodeURIComponent(targetFileId)}`
            : "/";

        location.assign(route);
    }
</script>

<div class="flex h-full min-h-0 w-full flex-col">
    <header class="border-b border-base-300 bg-base-100 px-4 py-2 flex justify-between">
        <div>
            <p class="text-xs uppercase tracking-wide opacity-60">Shared file preview</p>
            <h1 class="truncate text-base font-semibold">{data.file.name}</h1>
        </div>

        {#if JWTAuth.getToken()}
            <button
                class="btn btn-neutral"
                onclick={onViewAsMember}
            >
                View as Member
            </button>
        {/if}
    </header>

    <div class="flex-1 min-h-0">
        <MainSectionArea />
    </div>
</div>
