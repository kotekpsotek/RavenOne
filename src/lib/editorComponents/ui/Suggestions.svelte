<!-- Should have: list of selectable items, each item selected closes the suggestions menu and pastes element there -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import type { ElementInsertionItem } from "./ElementsListForMenus.js";
    import { displayingItems, activedIdx, onItemSelected } from "./SuggestionsHandlers.js";

    let menuRef: HTMLUListElement | undefined = $state();

    /** Makes comparision on names */
    function isItemSelected(item: ElementInsertionItem) {
        const actuallySelectedItemIndex = $activedIdx;
        const actuallySelectedItem = $displayingItems[actuallySelectedItemIndex];

        if (!actuallySelectedItem) {
            return false;
        }

        return actuallySelectedItem.name === item.name;
    }

    $effect(() => {
        $activedIdx;

        if (menuRef) {
            const activeElement = menuRef.querySelector("button.active") as HTMLElement | null;
            if (activeElement) {
                activeElement.scrollIntoView({
                    block: "nearest",
                    behavior: "auto"
                });
            }
        }
    });
</script>

<ul
    bind:this={menuRef}
    class="menu w-[20rem] max-h-[18rem] flex-nowrap overflow-y-auto rounded-box border border-base-300 bg-base-100 p-2 text-base-content shadow-xl shadow-black/20"
>
    {#each $displayingItems as item (item.name)}
        <li>
            <button
                type="button"
                class:active={isItemSelected(item)}
                class:bg-base-300={isItemSelected(item)}
                class:font-semibold={isItemSelected(item)}
                onclick={onItemSelected(item)}
            >
                <Icon icon={item.icon} width="18" height="18" class="text-base-content/70" />
                <span>{item.name}</span>
            </button>
        </li>
    {/each}
</ul>