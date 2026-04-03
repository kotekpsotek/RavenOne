<script lang="ts">
    import Icon from "@iconify/svelte";
    import { File } from "@ravenlens/shared";
    import {
        changeFilePositionRequest,
        downloadFilesRequest,
        newFileRequest
    } from "$lib/files/connections/connections";
    import type { DropPosition } from "$lib/files/utils";
    import { entriesList, moveEntry, selectedFile } from "$lib/stores/files";
    import { canManageWorkspaceFiles, workspaceSubscriptionCheckInProgress } from "$lib/stores/subscription";
    import { selectedWorkspace } from "$lib/stores/workspace";
    import { setAlert } from "$lib/utils/alert";
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import FileEntry from "./FileEntry.svelte";
    import { findFileById, getCurrentWorkspaceId } from "./utils";
    import { page } from "$app/stores";
    import { fileMap } from "$lib/utils/files";

    let { isExpanded = false }: { isExpanded?: boolean } = $props();

    let activeWorkspaceId: string | null = null;
    let filesSyncRequestId = 0;

    let draggedId = $state<string | null>(null);
    let dropTargetId = $state<string | null>(null);
    let dropPosition = $state<DropPosition>(null);

    async function downloadWorkspaceFiles(workspaceId: string) {
        const currentRequestId = ++filesSyncRequestId;

        const responseBody = await downloadFilesRequest(workspaceId);
        if (currentRequestId !== filesSyncRequestId || workspaceId !== activeWorkspaceId) {
            return;
        }

        if (!responseBody) {
            return;
        }

        const downloadedFiles = Array.isArray(responseBody.files) ? responseBody.files : [];
        entriesList.set(downloadedFiles);

        // Selects file has to be selected
        const pageLocal = $page.url;
        if (pageLocal.searchParams.has("openFileId")) {
            const fileIdToOpen = pageLocal.searchParams.get("openFileId");
            const fileFromListAll = downloadedFiles.flatMap(fileMap);

            const fileFound = fileFromListAll.find(file => file.id === fileIdToOpen);
            if (fileFound) {
                selectedFile.selectFile(fileFound);
                return;
            }
        }

        const selectedFileCurrent = get(selectedFile);
        if (!selectedFileCurrent) {
            return;
        }

        const refreshedSelectedFile = findFileById(downloadedFiles, selectedFileCurrent.id);
        if (!refreshedSelectedFile) {
            selectedFile.set(undefined);
            return;
        }

        selectedFile.set(refreshedSelectedFile);
    }

    onMount(() => {
        const unsubscribe = selectedWorkspace.subscribe((workspace) => {
            const selectedWorkspaceId = workspace?.id?.trim() || null;

            if (selectedWorkspaceId === activeWorkspaceId) {
                return;
            }

            activeWorkspaceId = selectedWorkspaceId;
            entriesList.set([]);
            selectedFile.set(undefined);
            resetDragState();

            if (!selectedWorkspaceId) {
                return;
            }

            void downloadWorkspaceFiles(selectedWorkspaceId);
        });

        return unsubscribe;
    });

    function ensureActiveWorkspaceSubscription(operationName: string): boolean {
        if ($canManageWorkspaceFiles) {
            return true;
        }

        if (!$workspaceSubscriptionCheckInProgress) {
            setAlert(
                "warning",
                "Active workspace subscription required",
                `Cannot ${operationName} because this workspace has no active subscription.`
            );
        }

        return false;
    }

    async function onNewFile(targetId: string | null = null) {
        if (!ensureActiveWorkspaceSubscription("create files")) {
            return;
        }

        const workspaceId = getCurrentWorkspaceId();
        if (!workspaceId) {
            return;
        }

        const name = getNextName($entriesList, "Document");
        const responseBody = await newFileRequest(workspaceId, targetId, name);
        if (!responseBody) {
            return;
        }

        const newFile: File.File.File = responseBody.createdFile ?? {
            type: "file",
            id: crypto.randomUUID(),
            name,
            lists: [],
            createdAt: new Date(),
            content: "",
            createdByAuthorId: workspaceId
        };

        if (targetId === null) {
            entriesList.update((list) => [...list, newFile]);
            return;
        }

        function addToTarget(items: File.File.File[]): File.File.File[] {
            return items.map((item) => {
                if (item.id === targetId) {
                    return {
                        ...item,
                        subentries: [...(item.subentries ?? []), newFile]
                    };
                }

                if (item.subentries?.length) {
                    return {
                        ...item,
                        subentries: addToTarget(item.subentries)
                    };
                }

                return item;
            });
        }

        entriesList.update((list) => addToTarget(list));
    }

    function getNextName(entries: File.File.File[], type: "Document") {
        const prefix = `Unnamed ${type}`;
        let max = 0;

        function scan(items: File.File.File[]) {
            for (const item of items) {
                const match = item.name.match(new RegExp(`^${prefix} (\\d+)$`));
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > max) {
                        max = num;
                    }
                }

                if (item.subentries?.length) {
                    scan(item.subentries);
                }
            }
        }

        scan(entries);
        return `${prefix} ${max + 1}`;
    }

    function resetDragState() {
        draggedId = null;
        dropTargetId = null;
        dropPosition = null;
    }

    async function handleRootDrop(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();

        if (!draggedId) {
            resetDragState();
            return;
        }

        const sourceId = draggedId;
        const workspaceId = getCurrentWorkspaceId();

        if (workspaceId) {
            const moveResult = await changeFilePositionRequest(
                workspaceId,
                sourceId,
                null,
                "inside"
            );
            if (moveResult) {
                moveEntry(sourceId, null, "inside");
            }
        }

        resetDragState();
    }

    function onSelectFile(clickedFile: File.File.File) {
        selectedFile.selectFile(clickedFile)
    }
</script>

{#if isExpanded}
    <div class="animate-in slide-in-from-left flex flex-1 flex-col overflow-hidden bg-base-100/50 p-4 duration-300">
        <div class="mb-4 flex items-center justify-between">
            <h5 class="text-xs font-bold uppercase tracking-wider text-base-content/50">Documents Explorer</h5>

            <div class="flex items-center gap-1">
                <button
                    onclick={() => void onNewFile()}
                    class="btn btn-ghost btn-square btn-xs hover:bg-base-300 disabled:cursor-not-allowed"
                    title={!$canManageWorkspaceFiles ? "Active workspace subscription required" : "New File"}
                    disabled={!$canManageWorkspaceFiles}
                >
                    <Icon icon="material-symbols:note-add-outline-rounded" class="text-lg" />
                </button>
            </div>
        </div>

        <nav
            class="scrollbar-hide flex-1 space-y-0.5 overflow-y-auto"
            ondragover={(e) => {
                if (!draggedId) {
                    return;
                }

                e.preventDefault();
                if (e.target === e.currentTarget) {
                    dropTargetId = null;
                    dropPosition = "inside";
                }
            }}
            ondrop={handleRootDrop}
        >
            {#each $entriesList as entry (entry.id)}
                <FileEntry
                    {entry}
                    {onNewFile}
                    {onSelectFile}
                    selectedEntriesId={[$selectedFile?.id].filter(v => v !== undefined)}
                    bind:draggedId
                    bind:dropTargetId
                    bind:dropPosition
                />
            {/each}
        </nav>
    </div>
{/if}
