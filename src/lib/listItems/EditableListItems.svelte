<script lang="ts">
    import { page } from '$app/stores';
    import { tick } from 'svelte';
    import { UI } from '@ravenlens/frontend';
    import { clickedListItemId, hoveredListItemId } from '$lib/stores/hoveredListItem';
    import { selectedFile } from '$lib/stores/files';
    import { createListItemId, findItemIndex, findSubtreeEndIndex, isPointPlayable } from './utils';
    import { playableDocumentsAndListsWithPoints } from '$lib/stores/playModeStore';
    import AITaskPlayingState from './mods/AITaskPlayingState.svelte';
    import { File } from "@ravenlens/shared";

    let {
        kind,
        onEmptyList = () => {},
        isReadOnly = false,
        spawnedList
    }: {
        kind: File.File.ListItemKind;
        spawnedList: File.File.SpawnedList
        onEmptyList?: () => void;
        isReadOnly?: boolean;
    } = $props();

    const INDENT_SIZE = 24;
    const ITEM_ID_ATTR = 'data-list-item-id';

    let items = $derived(spawnedList!.items);
    let removeTargetItemId = $state<string | null>(null);
    const isSharedRoute = $derived($page.url.pathname.startsWith('/share/'));
    const isEditingDisabled = $derived(isSharedRoute || isReadOnly);

    function createItem(depth: number): File.File.EditableListItem {
        return {
            id: createListItemId(),
            text: '',
            depth,
            checked: false
        };
    }

    function stopPlayingItem(itemId: string) {
        if (!playableDocumentsAndListsWithPoints.isPointPlaying($selectedFile, spawnedList.id, itemId)) {
            return;
        }

        playableDocumentsAndListsWithPoints.stopPlayingPoint($selectedFile!, spawnedList.id, itemId);
    }

    function resizeTextarea(textarea: HTMLTextAreaElement) {
        textarea.style.height = '0px';
        textarea.style.height = `${textarea.scrollHeight}px`;
    }

    function setCaretAtEnd(textarea: HTMLTextAreaElement) {
        const lastPosition = textarea.value.length;
        textarea.focus();
        textarea.setSelectionRange(lastPosition, lastPosition);
    }

    async function queueFocus(itemId: string) {
        await tick();

        const textarea = document.querySelector<HTMLTextAreaElement>(`textarea[${ITEM_ID_ATTR}="${itemId}"]`);
        if (!textarea) {
            return;
        }

        setCaretAtEnd(textarea);
        resizeTextarea(textarea);
    }

    async function updateItemText(itemId: string, text: string) {
        if (isReadOnly) {
            return;
        }

        items = items.map((item) => {
            if (item.id !== itemId) {
                return item;
            }

            return {
                ...item,
                text
            };
        });

        await selectedFile.updateFileListItems(spawnedList.id, items);
    }

    function toggleChecked(itemId: string, checked: boolean) {
        if (isReadOnly) {
            return;
        }

        items = items.map((item) => {
            if (item.id !== itemId) {
                return item;
            }

            return {
                ...item,
                checked
            };
        });
    }

    function addSiblingItem(itemId: string) {
        if (isReadOnly) {
            return;
        }

        const itemIndex = findItemIndex(items, itemId);
        if (itemIndex === -1) {
            return;
        }

        const currentItem = items[itemIndex];
        const insertIndex = findSubtreeEndIndex(items, itemIndex);
        const newItem = createItem(currentItem.depth);

        selectedFile.update(sf => {
            const listIndex = sf?.lists.findIndex(list => list.id === spawnedList.id);
            if (listIndex === undefined || listIndex < 0) {
                return sf
            }

            sf!.lists[listIndex].items = [
                ...items.slice(0, insertIndex),
                newItem,
                ...items.slice(insertIndex)
            ]
            
            return sf;
        })

        void queueFocus(newItem.id);
    }

    function changeIndent(itemId: string, indentDelta: number) {
        if (isReadOnly) {
            return;
        }

        const itemIndex = findItemIndex(items, itemId);
        if (itemIndex === -1) {
            return;
        }

        const currentItem = items[itemIndex];
        const subtreeEndIndex = findSubtreeEndIndex(items, itemIndex);

        const previousItem = items[itemIndex - 1];
        const maxDepth = previousItem ? previousItem.depth + 1 : 0;

        const targetDepth = Math.min(maxDepth, Math.max(0, currentItem.depth + indentDelta));
        if (targetDepth === currentItem.depth) {
            return;
        }

        const depthDelta = targetDepth - currentItem.depth;

        selectedFile.update(sf => {
            const listIndex = sf?.lists.findIndex(list => list.id === spawnedList.id);
            if (listIndex === undefined || listIndex < 0) {
                return sf
            }

            sf!.lists[listIndex].items = items.map((item, index) => {
                if (index < itemIndex || index >= subtreeEndIndex) {
                    return item;
                }

                return {
                    ...item,
                    depth: Math.max(0, item.depth + depthDelta)
                };
            });
            
            return sf;
        });
    }

    /** Show alert only when item has some child isn't empty - otherwise remove simply */
    function requestRemoveItem(itemId: string) {
        if (isReadOnly) {
            return;
        }

        if (!isPointPlayable(items, itemId)) {
            removeItemWithChildren(itemId);
            return;
        }

        removeTargetItemId = itemId;
    }

    function closeRemoveModal() {
        removeTargetItemId = null;
    }

    function getChildItemsCount(itemId: string) {
        const itemIndex = findItemIndex(items, itemId);
        if (itemIndex === -1) {
            return 0;
        }

        const subtreeEndIndex = findSubtreeEndIndex(items, itemIndex);
        return Math.max(0, subtreeEndIndex - itemIndex - 1);
    }

    function removeItemWithChildren(itemId: string) {
        if (isReadOnly) {
            return;
        }

        const itemIndex = findItemIndex(items, itemId);
        if (itemIndex === -1) {
            closeRemoveModal();
            return;
        }

        const subtreeEndIndex = findSubtreeEndIndex(items, itemIndex);
        const removedItemIds = items.slice(itemIndex, subtreeEndIndex).map((item) => item.id);
        const focusCandidateId = items[itemIndex - 1]?.id ?? items[subtreeEndIndex]?.id ?? null;

        removedItemIds.forEach((id) => {
            stopPlayingItem(id);
        });

        const hoveredItemId = $hoveredListItemId;
        if (hoveredItemId && removedItemIds.includes(hoveredItemId)) {
            hoveredListItemId.set(null);
        }

        const clickedItemId = $clickedListItemId;
        if (clickedItemId && removedItemIds.includes(clickedItemId)) {
            clickedListItemId.set(null);
        }

        const nextItems = [
            ...items.slice(0, itemIndex),
            ...items.slice(subtreeEndIndex)
        ];

        // Removes from file
        selectedFile.update(sf => {
            const listIndex = sf?.lists.findIndex(list => list.id === spawnedList.id);
            if (listIndex === undefined || listIndex < 0) {
                return sf
            }

            sf!.lists[listIndex].items = nextItems;
            
            return sf;
        });

        // Remove item playing
        playableDocumentsAndListsWithPoints.stopPlayingPoint($selectedFile!, spawnedList.id, itemId)
            .catch(err => console.error(`Cannot stop point: ${err}`));
        
        //
        closeRemoveModal();

        if (nextItems.length === 0) {
            onEmptyList();
            return;
        }

        if (focusCandidateId) {
            void queueFocus(focusCandidateId);
        }
    }

    function onConfirmRemoveItem() {
        if (isReadOnly) {
            return;
        }

        if (!removeTargetItemId) {
            return;
        }

        removeItemWithChildren(removeTargetItemId);
    }

    function getOrderedMarker(itemIndex: number) {
        const counters: number[] = [];

        for (let index = 0; index <= itemIndex; index += 1) {
            const depth = items[index].depth;
            counters.length = depth + 1;
            counters[depth] = (counters[depth] ?? 0) + 1;
        }

        const itemDepth = items[itemIndex].depth;
        const markerValue = counters[itemDepth] ?? 1;

        if (itemDepth % 2 === 0) {
            return String(markerValue);
        }

        return toAlphabeticalMarker(markerValue);
    }

    function toAlphabeticalMarker(value: number) {
        let workingValue = value;
        let marker = '';

        while (workingValue > 0) {
            const remainder = (workingValue - 1) % 26;
            marker = String.fromCharCode(97 + remainder) + marker;
            workingValue = Math.floor((workingValue - 1) / 26);
        }

        return marker || 'a';
    }

    function getUnorderedMarker(depth: number) {
        const markers = ['•', '◦', '▪'];
        return markers[depth % markers.length];
    }

    async function onItemInput(event: Event, itemId: string) {
        if (isEditingDisabled) {
            return;
        }

        const textarea = event.currentTarget as HTMLTextAreaElement;
        await updateItemText(itemId, textarea.value);
        resizeTextarea(textarea);
    }

    function onItemKeyDown(event: KeyboardEvent, itemId: string) {
        if (isEditingDisabled) {
            event.preventDefault();
            return;
        }

        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            addSiblingItem(itemId);
            return;
        }

        if (event.key === 'Backspace') {
            const textarea = event.currentTarget as HTMLTextAreaElement;
            const isCaretAtStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;

            if (isCaretAtStart) {
                event.preventDefault();

                const itemIndex = findItemIndex(items, itemId);
                if (itemIndex < 0) {
                    return;
                }

                if (items[itemIndex].depth > 0) {
                    changeIndent(itemId, -1);
                    return;
                }

                requestRemoveItem(itemId);
                return;
            }
        }

        if (event.key === 'Tab') {
            event.preventDefault();
            changeIndent(itemId, event.shiftKey ? -1 : 1);
        }
    }
</script>

<div class="space-y-1">
    {#each items as item, itemIndex (item.id)}
        {@const playableStoreState = $playableDocumentsAndListsWithPoints}
        {@const isPointPlaying = playableStoreState && playableDocumentsAndListsWithPoints.isPointPlaying($selectedFile, spawnedList.id, item.id)}
    
        <div
            class="flex flex-col w-full min-w-0 justify-center py-0.5"
            style={`padding-left: ${item.depth * INDENT_SIZE}px`}
        >
            <div
                class="upper flex w-full min-w-0 items-center"
            >
                <div class="relative flex w-full min-w-0 items-center gap-2">
                    {#if kind === 'ordered'}
                        <span class="w-fit shrink-0 text-right text-sm text-base-content/70">{getOrderedMarker(itemIndex)}.</span>
                    {:else if kind === 'unordered'}
                        <span class="w-fit shrink-0 text-center text-sm text-base-content/70">{getUnorderedMarker(item.depth)}</span>
                    {:else}
                        <label class="flex w-6 shrink-0 items-center justify-center">
                            <input
                                type="checkbox"
                                class="checkbox checkbox-sm checkbox-primary"
                                checked={item.checked}
                                title="Checkbox is manually interactive. Checkbox is going be checked out when finished"
                                onclick={e => e.preventDefault()}
                                onchange={(event) => toggleChecked(item.id, (event.currentTarget as HTMLInputElement).checked)}
                                disabled={isSharedRoute || isReadOnly}
                            />
                        </label>
                    {/if}

                    <textarea
                        rows="1"
                        value={item.text}
                        data-list-item-id={item.id}
                        placeholder="Type and press Enter"
                        disabled={isPointPlaying || isSharedRoute || isReadOnly}
                        class="w-full min-w-0 resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-1 py-1 text-sm leading-6 outline-none focus:border-base-300 focus:bg-base-100"
                        oninput={(event) => onItemInput(event, item.id)}
                        onkeydown={(event) => onItemKeyDown(event, item.id)}
                        onfocus={(event) => resizeTextarea(event.currentTarget as HTMLTextAreaElement)}
                    ></textarea>
                </div>
            </div>
        </div>
    {/each}
</div>

{#if removeTargetItemId}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-[90] bg-black/40" onclick={closeRemoveModal}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="flex items-center justify-center p-4" onclick={(event) => event.stopPropagation()}>
            <UI.Modals.ModalWrapper
                name="Remove list item"
                open={true}
                closeOnBackdrop={true}
                size="lg"
                on:close={closeRemoveModal}
            >
                <UI.Modals.ModalWrapperHeading
                    headingName="Remove list item"
                    on:close={closeRemoveModal}
                />

                <div class="space-y-4">
                    <p class="text-sm text-base-content/80">
                        This list item will be removed with its subpoints.
                        {#if getChildItemsCount(removeTargetItemId) > 0}
                            It will also remove {getChildItemsCount(removeTargetItemId)} child item(s).
                        {/if}
                    </p>

                    <div class="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            onclick={closeRemoveModal}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            class="btn btn-error btn-sm"
                            onclick={onConfirmRemoveItem}
                        >
                            Remove
                        </button>
                    </div>
                </div>
            </UI.Modals.ModalWrapper>
        </div>
    </div>
{/if}