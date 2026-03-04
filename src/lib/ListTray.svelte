<script lang="ts">
    import { onMount } from 'svelte';
    import { selectedFile, type EditableListItem, type ListItemKind } from '$lib/stores/files';
    import Icon from '@iconify/svelte';
    import type { ElementInsertionItem } from './editorComponents/ui/ElementsListForMenus';
    import OrderedListItem from '$lib/listItems/OrderedListItem.svelte';
    import UnorderedListItem from '$lib/listItems/UnorderedListItem.svelte';
    import TaskListItem from '$lib/listItems/TaskListItem.svelte';
    import { createListId } from './listItems/utils';

    const PANEL_HEIGHT_STORAGE_PREFIX = 'list-tray-height';
    const PANEL_MIN_HEIGHT = 120;
    const PANEL_DEFAULT_HEIGHT = 220;
    const PANEL_MAX_VIEWPORT_RATIO = 0.6;

    let trayHeight = $state(PANEL_DEFAULT_HEIGHT);
    let isResizing = $state(false);
    let isResizeHandleHovered = $state(false);

    let startClientY = 0;
    let startPanelHeight = 0;

    const listTypes: ElementInsertionItem[] = [
        {
            name: "AI Bullet list",
            icon: "material-symbols:auto-awesome",
            aliases: ["ai", "ai ul", "ai list", "smart bullet"],
            command: (editor, range) => {
                editor.chain().focus().deleteRange(range).toggleBulletList().run();
            }
        },
        {
            name: "AI Ordered list",
            icon: "material-symbols:format-list-numbered-rounded",
            aliases: ["ai", "ai ol", "ai numbered", "smart ordered"],
            command: (editor, range) => {
                editor.chain().focus().deleteRange(range).toggleOrderedList().run();
            }
        },
        {
            name: "AI Checkbox list",
            icon: "material-symbols:checklist-rounded",
            aliases: ["ai", "ai checklist", "ai task", "smart checkbox"],
            command: (editor, range) => {
                editor.chain().focus().deleteRange(range).toggleTaskList().run();
            }
        },
    ];

    const selectedFileId = $derived($selectedFile?.id ?? '');

    function createId() {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }

        return `list-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
    }

    function resolveListKind(item: ElementInsertionItem): ListItemKind {
        if (item.name.toLowerCase().includes('checkbox') || item.name.toLowerCase().includes('task')) {
            return 'task';
        }

        if (item.name.toLowerCase().includes('ordered')) {
            return 'ordered';
        }

        return 'unordered';
    }

    function onSelectListType(item: ElementInsertionItem, event: MouseEvent) {
        let listKind = resolveListKind(item);
        const listItem: EditableListItem = listKind === "task" ?
            {
                id: createListId(),
                text: "",
                depth: 0,
                checked: false
            }
            :
            {
                id: createListId(),
                text: "",
                depth: 0
            }
        
        $selectedFile!.lists = [
            ...$selectedFile!.lists,
            {
                id: createId(),
                kind: listKind,
                name: item.name,
                icon: item.icon,
                items: [listItem]
            }
        ];

        const triggerElement = event.currentTarget as HTMLElement | null;
        triggerElement?.closest('details')?.removeAttribute('open');
    }

    function removeSpawnedList(spawnedListId: string) {
        $selectedFile!.lists = $selectedFile!.lists.filter((spawnedList) => spawnedList.id !== spawnedListId);
    }

    function getStorageKey(fileId: string) {
        return `${PANEL_HEIGHT_STORAGE_PREFIX}:${fileId}`;
    }

    function getMaxHeight() {
        if (typeof window === 'undefined') {
            return Number.POSITIVE_INFINITY;
        }

        return Math.floor(window.innerHeight * PANEL_MAX_VIEWPORT_RATIO);
    }

    function clampHeight(height: number) {
        return Math.min(getMaxHeight(), Math.max(PANEL_MIN_HEIGHT, height));
    }

    function saveTrayHeight(fileId: string, height: number) {
        if (typeof window === 'undefined' || !fileId) {
            return;
        }

        localStorage.setItem(getStorageKey(fileId), String(clampHeight(height)));
    }

    function loadTrayHeight(fileId: string) {
        if (typeof window === 'undefined' || !fileId) {
            trayHeight = clampHeight(PANEL_DEFAULT_HEIGHT);
            return;
        }

        const storedHeight = Number(localStorage.getItem(getStorageKey(fileId)));
        if (Number.isFinite(storedHeight) && storedHeight > 0) {
            trayHeight = clampHeight(storedHeight);
            return;
        }

        trayHeight = clampHeight(PANEL_DEFAULT_HEIGHT);
    }

    function onResizeHandleMouseDown(event: MouseEvent) {
        isResizing = true;
        startClientY = event.clientY;
        startPanelHeight = trayHeight;

        window.addEventListener('mousemove', onResizeMouseMove);
        window.addEventListener('mouseup', onResizeMouseUp);

        document.body.classList.add('cursor-ns-resize', 'select-none');
        event.preventDefault();
    }

    function onResizeMouseMove(event: MouseEvent) {
        if (!isResizing) {
            return;
        }

        const deltaY = event.clientY - startClientY;
        trayHeight = clampHeight(startPanelHeight - deltaY);
    }

    function onResizeMouseUp() {
        if (!isResizing) {
            return;
        }

        if (selectedFileId) {
            saveTrayHeight(selectedFileId, trayHeight);
        }

        stopResize();
    }

    function stopResize() {
        isResizing = false;
        window.removeEventListener('mousemove', onResizeMouseMove);
        window.removeEventListener('mouseup', onResizeMouseUp);
        document.body.classList.remove('cursor-ns-resize', 'select-none');
    }

    function onWindowResize() {
        const clampedHeight = clampHeight(trayHeight);
        if (clampedHeight !== trayHeight) {
            trayHeight = clampedHeight;

            if (selectedFileId) {
                saveTrayHeight(selectedFileId, clampedHeight);
            }
        }
    }

    onMount(() => {
        const unsubscribe = selectedFile.subscribe((file) => {
            loadTrayHeight(file?.id ?? '');
        });

        return () => {
            unsubscribe();
            stopResize();
        };
    });
</script>

<svelte:window onresize={onWindowResize} />

<div
    class="list-tray relative mt-5 overflow-hidden border-t border-base-300 bg-base-100 {isResizing ? '' : 'transition-[height] duration-200'}"
    style={`height: ${trayHeight}px`}
>
    <!-- Stripe to allow position changing -->
    <div
        class="absolute left-0 top-0 z-20 h-1.5 w-full cursor-ns-resize transition-colors {isResizing || isResizeHandleHovered ? 'bg-primary/50' : 'bg-transparent hover:bg-primary/30'}"
        title="Drag and drop to resize"
        onmouseenter={() => {
            isResizeHandleHovered = true;
        }}
        onmouseleave={() => {
            isResizeHandleHovered = false;
        }}
        onmousedown={onResizeHandleMouseDown}
        role="presentation"
    ></div>

    <!-- Items Height -->
    <div class="h-full overflow-y-auto px-4 py-4">
        <!--  -->
        <div class="upper-stripe">
            <details class="dropdown">
                <summary 
                    class="btn btn-xs btn-ghost m-1"
                    title="Select list point to add"
                >
                    <Icon icon="material-symbols:add-2-rounded"/>
                </summary>
    
                <ul class="menu dropdown-content bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
                    {#each listTypes as listType (listType.name)}
                        <li>
                            <button
                                type="button"
                                class="flex items-center gap-2"
                                onclick={(event) => onSelectListType(listType, event)}
                            >
                                <Icon icon={listType.icon} class="text-base-content/70" />
                                <span>{listType.name}</span>
                            </button>
                        </li>
                    {/each}
                </ul>
            </details>
        </div>

        <!-- List with items from list -->
        <div class="list-items space-y-2">
            {#each $selectedFile!.lists as spawnedList (spawnedList.id)}
                {#if spawnedList.kind === 'ordered'}
                    <OrderedListItem 
                        onEmptyList={() => removeSpawnedList(spawnedList.id)}
                        {spawnedList}
                    />
                {:else if spawnedList.kind === 'unordered'}
                    <UnorderedListItem 
                        onEmptyList={() => removeSpawnedList(spawnedList.id)}
                        {spawnedList}
                    />
                {:else}
                    <TaskListItem
                        onEmptyList={() => removeSpawnedList(spawnedList.id)}
                        {spawnedList}
                    />
                {/if}
            {/each}
        </div>
    </div>
</div>
