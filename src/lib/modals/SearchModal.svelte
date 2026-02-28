<script lang=ts>
    import { entriesList, isSearchModalOpen } from "$lib/stores/files";
    import Icon from "@iconify/svelte";
    import type { File } from "$lib/stores/files";
    import { selectedFile } from "$lib/stores/files";

    const SEARCH_MODAL_MIN_MARGIN = 12;
    const SEARCH_MODAL_ROOT_ID = "editor-search-modal-root";
    const SEARCH_MODAL_ID = "editor-search-modal";

    let searchModalX = $state(24);
    let searchModalY = $state(24);

    let isDraggingSearchModal = $state(false);
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    let searchQuery = $state("");
        let expandedEntries = $state<Record<string, boolean>>({});
    let filteredSearchEntries = $derived(filterEntries($entriesList, searchQuery));
    
    // Logic
    function countDirectSubentries(entry: File) {
        return entry.subentries?.length ?? 0;
    }

    function isExpanded(entryId: string) {
        return expandedEntries[entryId] === true;
    }

    function toggleExpandEntry(entryId: string) {
        expandedEntries = {
            ...expandedEntries,
            [entryId]: !expandedEntries[entryId]
        };
    }

    function onSelectSearchEntry(entry: File) {
        $selectedFile = entry;
        $isSearchModalOpen = false;
    }
    
    function filterEntries(entries: File[], query: string): File[] {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
            return entries;
        }

        const filtered: File[] = [];

        for (const entry of entries) {
            const nested = entry.subentries?.length ? filterEntries(entry.subentries, normalizedQuery) : [];
            const matchesCurrent = entry.name.toLowerCase().includes(normalizedQuery);

            if (matchesCurrent || nested.length) {
                filtered.push({
                    ...entry,
                    subentries: nested
                });
            }
        }

        return filtered;
    }
    
    function closeSearchModal() {
        isDraggingSearchModal = false;
        $isSearchModalOpen = false;
    }

    function getSearchModalRootElement() {
        return document.getElementById(SEARCH_MODAL_ROOT_ID);
    }

    function getSearchModalElement() {
        return document.getElementById(SEARCH_MODAL_ID);
    }

    function clampSearchModalPosition(nextX: number, nextY: number) {
        const containerRect = getSearchModalRootElement()?.getBoundingClientRect();
        const modalRect = getSearchModalElement()?.getBoundingClientRect();

        if (!containerRect || !modalRect) {
            return { x: nextX, y: nextY };
        }

        const maxX = Math.max(SEARCH_MODAL_MIN_MARGIN, containerRect.width - modalRect.width - SEARCH_MODAL_MIN_MARGIN);
        const maxY = Math.max(SEARCH_MODAL_MIN_MARGIN, containerRect.height - modalRect.height - SEARCH_MODAL_MIN_MARGIN);

        return {
            x: Math.min(Math.max(SEARCH_MODAL_MIN_MARGIN, nextX), maxX),
            y: Math.min(Math.max(SEARCH_MODAL_MIN_MARGIN, nextY), maxY)
        };
    }
    
    function onSearchHeaderMouseDown(event: MouseEvent) {
        const searchModalElement = getSearchModalElement();
        if (!searchModalElement) {
            return;
        }

        const modalRect = searchModalElement.getBoundingClientRect();
        dragOffsetX = event.clientX - modalRect.left;
        dragOffsetY = event.clientY - modalRect.top;
        isDraggingSearchModal = true;
        event.preventDefault();
    }

    function onWindowMouseMove(event: MouseEvent) {
        const rootElement = getSearchModalRootElement();
        if (!isDraggingSearchModal || !$isSearchModalOpen || !rootElement) {
            return;
        }

        const containerRect = rootElement.getBoundingClientRect();
        const nextX = event.clientX - containerRect.left - dragOffsetX;
        const nextY = event.clientY - containerRect.top - dragOffsetY;
        const clamped = clampSearchModalPosition(nextX, nextY);
        searchModalX = clamped.x;
        searchModalY = clamped.y;
    }

    function onWindowMouseUp() {
        isDraggingSearchModal = false;
    }

    function onWindowKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape" && $isSearchModalOpen) {
            closeSearchModal();
        }
    }
</script>

{#snippet renderSearchEntry(entry: File, depth = 0)}
    {@const hasSubentries = (entry.subentries?.length ?? 0) > 0}
    {@const entryExpanded = isExpanded(entry.id) || searchQuery.trim().length > 0}

    <li class="space-y-1">
        <div class="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-base-300/70">
            {#if hasSubentries}
                <button
                    class="btn btn-ghost btn-xs btn-square min-h-0 h-6 w-6"
                    onclick={(event) => {
                        event.stopPropagation();
                        toggleExpandEntry(entry.id);
                    }}
                    aria-label={entryExpanded ? "Collapse subentries" : "Expand subentries"}
                >
                    <Icon icon={entryExpanded ? "material-symbols:keyboard-arrow-down-rounded" : "material-symbols:keyboard-arrow-right"} class="text-lg"/>
                </button>
            {:else}
                <span class="w-6" aria-hidden="true"></span>
            {/if}

            <button
                class="flex min-w-0 flex-1 items-center gap-2 text-left"
                onclick={() => {
                    onSelectSearchEntry(entry);
                }}
            >
                <Icon icon={entry.icon ?? "material-symbols:description-outline-rounded"} class="text-lg text-base-content/70"/>
                <span class="truncate text-sm" style={`padding-left: ${depth * 8}px`}>{entry.name}</span>
            </button>

            {#if depth === 0 && hasSubentries}
                <span class="badge badge-ghost badge-sm">{countDirectSubentries(entry)}</span>
            {/if}
        </div>

        {#if hasSubentries && entryExpanded}
            <ul class="ml-3 border-l border-base-300 pl-2 space-y-1">
                {#each entry.subentries ?? [] as subentry (subentry.id)}
                    {@render renderSearchEntry(subentry, depth + 1)}
                {/each}
            </ul>
        {/if}
    </li>
{/snippet}

<svelte:window
    onmousemove={onWindowMouseMove}
    onmouseup={onWindowMouseUp}
    onkeydown={onWindowKeyDown}
/>

{#if $isSearchModalOpen}
    <section
        id={SEARCH_MODAL_ROOT_ID}
        class="absolute inset-0 z-40 pointer-events-none"
        role="presentation"
    >
        <div
            id={SEARCH_MODAL_ID}
            class="absolute pointer-events-auto w-[34rem] max-w-[calc(100%-1.5rem)] rounded-2xl border border-base-300 bg-base-100/95 shadow-xl backdrop-blur-sm"
            style={`left: ${searchModalX}px; top: ${searchModalY}px;`}
            role="dialog"
            aria-modal="true"
            aria-label="Search files"
        >
            <header
                class="flex items-center justify-between gap-2 border-b border-base-300 px-3 py-2"
            >
                <div
                    class="flex cursor-move items-center gap-2 text-base-content/70"
                    role="button"
                    tabindex="0"
                    onmousedown={onSearchHeaderMouseDown}
                    onkeydown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                        }
                    }}
                    aria-label="Drag search modal"
                >
                    <Icon icon="material-symbols:search-rounded" class="text-xl"/>
                    <span class="text-sm font-medium select-none">Search available files</span>
                </div>

                <button
                    class="btn btn-ghost btn-xs btn-square"
                    onclick={closeSearchModal}
                    aria-label="Close search modal"
                >
                    <Icon icon="material-symbols:close-rounded" class="text-lg"/>
                </button>
            </header>

            <div class="border-b border-base-300 px-3 py-2">
                <label class="input input-sm input-bordered flex items-center gap-2 bg-base-100">
                    <Icon icon="material-symbols:search-rounded" class="text-base-content/50"/>
                    <input
                        type="text"
                        class="grow"
                        placeholder="Type anything to search files..."
                        bind:value={searchQuery}
                    />
                </label>
            </div>

            <div class="max-h-[65vh] overflow-y-auto px-2 py-2">
                <div class="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-base-content/50">
                    Available files ({filteredSearchEntries.length})
                </div>

                {#if filteredSearchEntries.length}
                    <ul class="space-y-1">
                        {#each filteredSearchEntries as entry (entry.id)}
                            {@render renderSearchEntry(entry)}
                        {/each}
                    </ul>
                {:else}
                    <div class="px-3 py-8 text-center text-sm text-base-content/60">
                        No files found.
                    </div>
                {/if}
            </div>
        </div>
    </section>
{/if}