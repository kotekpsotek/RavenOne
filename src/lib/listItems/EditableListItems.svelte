<script lang="ts">
    import { page } from '$app/stores';
    import { tick } from 'svelte';
    import { UI } from '@ravenlens/frontend';
    import { selectedFile } from '$lib/stores/files';
    import { File } from "@ravenlens/shared";
    import { createListItemId } from './utils';

    type SpawnedListEntry = File.File.SpawnedList["list"][number];

    let {
        kind,
        onEmptyList = () => {},
        isReadOnly = false,
        spawnedList
    }: {
        kind: File.File.ListItemKind;
        spawnedList: SpawnedListEntry
        onEmptyList?: () => void;
        isReadOnly?: boolean;
    } = $props();

    const INDENT_SIZE = 24;
    const ITEM_ID_ATTR = 'data-list-item-id';

    let items = $derived(spawnedList!.items);
    let removeTargetItemId = $state<string | null>(null);
    const isSharedRoute = $derived($page.url.pathname.startsWith('/share/'));
    const isEditingDisabled = $derived(isSharedRoute || isReadOnly);

    function createItem(depth: number): File.File.EditableListItemItself {
        return {
            id: createListItemId(),
            text: '',
            depth,
            checked: false
        };
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

    async function addSiblingItem(itemId: string) {
        if (isEditingDisabled) {
            return;
        }

        const itemIndex = items.findIndex((item) => item.id === itemId);
        if (itemIndex < 0) {
            return;
        }

        const currentItem = items[itemIndex];
        let insertIndex = itemIndex + 1;

        // Insert after the current item subtree so nested children stay grouped.
        while (insertIndex < items.length && items[insertIndex].depth > currentItem.depth) {
            insertIndex += 1;
        }

        const newItem = createItem(currentItem.depth);
        const nextItems = [
            ...items.slice(0, insertIndex),
            newItem,
            ...items.slice(insertIndex)
        ];

        items = nextItems;
        await selectedFile.updateFileListItems(spawnedList.id, nextItems);
        await queueFocus(newItem.id);
    }

    async function changeIndent(itemId: string, indentDelta: number) {
        if (isEditingDisabled || indentDelta === 0) {
            return;
        }

        const itemIndex = items.findIndex((item) => item.id === itemId);
        if (itemIndex < 0) {
            return;
        }

        const currentItem = items[itemIndex];
        let nextDepth = currentItem.depth;

        if (indentDelta > 0) {
            // Keep indentation valid: max one level deeper than the previous item.
            if (itemIndex === 0) {
                return;
            }

            const maxDepth = items[itemIndex - 1].depth + 1;
            nextDepth = Math.min(currentItem.depth + indentDelta, maxDepth);
        } else {
            nextDepth = Math.max(0, currentItem.depth + indentDelta);
        }

        if (nextDepth === currentItem.depth) {
            return;
        }

        const nextItems = items.map((item, index) => {
            if (index !== itemIndex) {
                return item;
            }

            return {
                ...item,
                depth: nextDepth
            };
        });

        items = nextItems;
        await selectedFile.updateFileListItems(spawnedList.id, nextItems);
        await queueFocus(itemId);
    }

    function closeRemoveModal() {
        removeTargetItemId = null;
    }

    async function removeItemWithChildren(itemId: string) {
        const itemIndex = items.findIndex((item) => item.id === itemId);
        if (itemIndex < 0) {
            return;
        }

        const itemDepth = items[itemIndex].depth;
        let removeEndIndex = itemIndex + 1;

        while (removeEndIndex < items.length && items[removeEndIndex].depth > itemDepth) {
            removeEndIndex += 1;
        }

        const nextItems = [
            ...items.slice(0, itemIndex),
            ...items.slice(removeEndIndex)
        ];

        items = nextItems;
        await selectedFile.updateFileListItems(spawnedList.id, nextItems);

        if (nextItems.length === 0) {
            onEmptyList();
            return;
        }

        const focusIndex = Math.min(itemIndex, nextItems.length - 1);
        const nextFocusItem = nextItems[focusIndex];
        if (nextFocusItem) {
            await queueFocus(nextFocusItem.id);
        }
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

    async function onConfirmRemoveItem() {
        if (isEditingDisabled || !removeTargetItemId) {
            return;
        }

        const itemId = removeTargetItemId;
        removeTargetItemId = null;

        await removeItemWithChildren(itemId);
    }

    async function onItemKeyDown(event: KeyboardEvent, itemId: string) {
        if (isEditingDisabled) {
            event.preventDefault();
            return;
        }

        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void addSiblingItem(itemId);
            return;
        }

        if (event.key === 'Backspace') {
            const textarea = event.currentTarget as HTMLTextAreaElement;
            const isCursorAtStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;

            if (!isCursorAtStart) {
                return;
            }

            event.preventDefault();

            const currentItem = items.find((item) => item.id === itemId);
            if (!currentItem) {
                return;
            }

            if (currentItem.depth > 0) {
                void changeIndent(itemId, -1);
                return;
            }

            if (currentItem.text.trim().length) {
                removeTargetItemId = itemId;
            }
            else await removeItemWithChildren(itemId);

            return;
        }

        if (event.key === 'Tab') {
            event.preventDefault();
            void changeIndent(itemId, event.shiftKey ? -1 : 1);
        }
    }
</script>

<div class="space-y-1">
    {#each items as item, itemIndex (item.id)}
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
                        disabled={isSharedRoute || isReadOnly}
                        class="point-text w-full min-w-0 resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-1 py-1 text-sm leading-6 outline-none focus:border-base-300 focus:bg-base-100"
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