<!-- Should have: list of selectable items, each item selected closes the suggestions menu and pastes element there -->
<script lang="ts">
    import type { ElementInsertionItem } from "./ElementsListForMenus.js";
    import { displayingItems, activedIdx, onItemSelected } from "./SuggestionsHandlers.js";

    /** Makes comparision on names */
    function isItemSelected(item: ElementInsertionItem) {
        const actuallySelectedItemIndex = $activedIdx;
        const actuallySelectedItem = $displayingItems[actuallySelectedItemIndex];

        if (!actuallySelectedItem) {
            return false;
        }

        return actuallySelectedItem.name === item.name;
    }
</script>

<div class="flex flex-col gap-1 text-white shadow-md border border-black shadow-gray-500 bg-gray-50 rounded-lg p-2 font-semibold overflow-y-auto" style="min-width: 300px; max-height: 500px;">
    {#each $displayingItems as item (item.name)}
        <button class="flex gap-1 p-1 text-lg rounded-lg {isItemSelected(item) ? "bg-gray-300" : ""} hover:bg-gray-200 text-black flex items-center" onclick={onItemSelected(item)}>
            {#if item.icon}
                <span>{item.icon}</span>
            {/if}
            <p>
                {item.name}
            </p>
        </button>
    {/each}
</div>