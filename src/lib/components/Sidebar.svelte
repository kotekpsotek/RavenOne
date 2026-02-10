<script lang="ts">
    import Icon from '@iconify/svelte';
    import { getDocuments, setActiveDocument, getActiveDocument, getFilter, setFilter, toggleExpand, addDocument } from '$lib/state.svelte';
    import clsx from 'clsx';
    
    // Derived state accessors
    const documents = $derived(getDocuments());
    const activeDoc = $derived(getActiveDocument());
    const currentFilter = $derived(getFilter());

    function handleFilterChange(e: Event) {
        setFilter((e.target as HTMLSelectElement).value as any);
    }

    function handleSelect(id: string) {
        setActiveDocument(id);
    }
</script>

<div class="h-full bg-base-200 w-64 flex flex-col border-r border-base-300 text-base-content">
    <!-- Header / Brand -->
    <div class="p-4 border-b border-base-300">
        <h1 class="text-xl font-bold text-primary">RavenOne</h1>
        
        <!-- Filter -->
        <div class="mt-4">
            <select class="select select-bordered select-sm w-full" value={currentFilter} onchange={handleFilterChange}>
                <option value="all">All Documents</option>
                <option value="document">Document</option>
                <option value="oneroutine">OneRoutiness</option>
            </select>
        </div>
    </div>

    <!-- Actions -->
    <div class="p-2">
        <button class="btn btn-ghost btn-sm w-full justify-start gap-2" onclick={() => addDocument(null, 'document')}>
            <Icon icon="material-symbols:add" class="w-4 h-4" />
            New Document
        </button>
        <button class="btn btn-ghost btn-sm w-full justify-start gap-2" onclick={() => addDocument(null, 'oneroutine')}>
            <Icon icon="material-symbols:add-circle-outline" class="w-4 h-4" />
            New Routine
        </button>
    </div>

    <!-- Tree -->
    <div class="flex-1 overflow-y-auto p-2">
        {#snippet docNode(doc: any, level: number)}
            {#if currentFilter === 'all' || doc.type === currentFilter || (currentFilter === 'document' && doc.type === 'document') || (currentFilter === 'oneroutine' && (doc.type === 'oneroutine' || doc.type === 'result'))}
                <div class="w-full">
                    <div 
                        class={clsx(
                            "flex items-center gap-1 p-1 rounded-md cursor-pointer hover:bg-base-300 transition-colors group",
                            activeDoc?.id === doc.id && "bg-base-300 font-medium"
                        )}
                        style="padding-left: {level * 12 + 4}px"
                        onclick={() => handleSelect(doc.id)}
                        onkeydown={(e) => e.key === 'Enter' && handleSelect(doc.id)}
                        role="button"
                        tabindex="0"
                    >
                        <!-- Chevron / Icon -->
                        {#if doc.children.length > 0}
                            <button 
                                class="btn btn-xs btn-square btn-ghost w-4 h-4 p-0 min-h-0"
                                onclick={(e) => { e.stopPropagation(); toggleExpand(doc.id); }}
                            >
                                <Icon 
                                    icon={doc.expanded ? "material-symbols:keyboard-arrow-down" : "material-symbols:keyboard-arrow-right"} 
                                    class="w-4 h-4 opacity-70"
                                />
                            </button>
                        {:else}
                            <span class="w-4"></span>
                        {/if}

                        <!-- Type Icon -->
                        <span class="opacity-70">
                            {#if doc.icon}
                                <Icon icon={doc.icon} class="w-4 h-4 text-primary" />
                            {:else if doc.type === 'document'}
                                <Icon icon="material-symbols:article-outline" class="w-4 h-4" />
                            {:else if doc.type === 'oneroutine'}
                                <Icon icon="material-symbols:repeat" class="w-4 h-4" />
                            {:else}
                                <Icon icon="material-symbols:output" class="w-4 h-4" />
                            {/if}
                        </span>

                        <span class="truncate text-sm flex-1">{doc.title}</span>

                        <!-- Add Child (visible on hover) -->
                         <div class="opacity-0 group-hover:opacity-100 flex gap-1">
                            {#if doc.type === 'oneroutine'}
                                <button 
                                    class="btn btn-xs btn-square btn-ghost w-4 h-4 min-h-0 p-0"
                                    title="Add Result"
                                    onclick={(e) => { e.stopPropagation(); addDocument(doc.id, 'result'); }}
                                >
                                    <Icon icon="material-symbols:add" class="w-3 h-3" />
                                </button>
                            {:else}
                                <button 
                                    class="btn btn-xs btn-square btn-ghost w-4 h-4 min-h-0 p-0"
                                    title="Add Sub-Document"
                                    onclick={(e) => { e.stopPropagation(); addDocument(doc.id, 'document'); }}
                                >
                                    <Icon icon="material-symbols:add" class="w-3 h-3" />
                                </button>
                            {/if}
                         </div>
                    </div>

                    <!-- Children -->
                    {#if doc.expanded && doc.children.length > 0}
                        <div>
                            {#each doc.children as child (child.id)}
                                {@render docNode(child, level + 1)}
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
        {/snippet}

        {#each documents as doc (doc.id)}
            {@render docNode(doc, 0)}
        {/each}
    </div>
</div>
