<script lang="ts">
    import Icon from "@iconify/svelte";
    import type { HelpMaterialWithContent } from "@ravenlens/shared";

    type EditableHelpMaterial = HelpMaterialWithContent & {
        category?: string;
        categories?: string[];
    };

	export let material: EditableHelpMaterial | null = null;
    export let editModeCategoriesAvailable: string[] = [];
    export let selectedCategories: string[] = [];
    export let customCategories: string[] = [];

    // Categories State
    let newCategoryTerm = "";
    let isAddCategoryModalOpen = false;

    // Init selected categories from material 
    if (material?.category) {
        selectedCategories = material.category.split(',').map(c => c.trim()).filter(Boolean);
    }
    
    $: if (material && selectedCategories !== undefined) {
        material.category = selectedCategories.join(', ');
    }

    function toggleCategory(cat: string) {
        if (selectedCategories.includes(cat)) {
            selectedCategories = selectedCategories.filter(c => c !== cat);
        } else {
            selectedCategories = [...selectedCategories, cat];
        }
    }

    function removeCustomCategory(cat: string) {
        customCategories = customCategories.filter(c => c !== cat);
        selectedCategories = selectedCategories.filter(c => c !== cat);
    }

    function handleAddCategoryKeyDown(ev: KeyboardEvent) {
        if (ev.key === "Enter") {
            addNewCategory();
        }
    }

    function addNewCategory() {
        const cat = newCategoryTerm.trim();
        if (cat && !editModeCategoriesAvailable.includes(cat) && !customCategories.includes(cat)) {
            customCategories = [...customCategories, cat];
            if (!selectedCategories.includes(cat)) {
                selectedCategories = [...selectedCategories, cat];
            }
        } else if (cat && !selectedCategories.includes(cat)) {
            selectedCategories = [...selectedCategories, cat];
        }
        newCategoryTerm = "";
        isAddCategoryModalOpen = false;
        
        const modal = document.getElementById("add-category-modal") as HTMLDialogElement;
        if (modal) modal.close();
    }

    function openAddCategoryModal() {
        isAddCategoryModalOpen = true;
        const modal = document.getElementById("add-category-modal") as HTMLDialogElement;
        if (modal) modal.showModal();
    }
    
    function closeAddCategoryModal() {
        isAddCategoryModalOpen = false;
        newCategoryTerm = "";
        const modal = document.getElementById("add-category-modal") as HTMLDialogElement;
        if (modal) modal.close();
    }
</script>

<div class="mb-6 flex flex-wrap items-center gap-2">
    <div>
        <!-- Available categories -->
        {#each editModeCategoriesAvailable as cat}
            <button
                class="px-4 py-1.5 rounded-full text-sm flex items-center gap-1.5 transition-colors bg-base-100 {selectedCategories.includes(cat) ? 'border border-blue-500' : 'border border-base-200 hover:border-base-300'}"
                on:click={() => toggleCategory(cat)}
            >
                {cat}
            </button>
        {/each}

        <!-- Custom user categories -->
        {#each customCategories as cat}
            <div class="inline-flex items-center rounded-full text-sm bg-base-100 transition-colors {selectedCategories.includes(cat) ? 'border border-blue-500' : 'border border-base-200'}">
                <button
                    class="pl-4 pr-1 py-1.5 hover:bg-base-200 hover:rounded-l-full"
                    on:click={() => toggleCategory(cat)}
                >
                    {cat}
                </button>
                <button
                    class="pr-3 pl-1 py-1.5 hover:text-error hover:bg-base-200 hover:rounded-r-full flex items-center justify-center"
                    on:click|stopPropagation={() => removeCustomCategory(cat)}
                    aria-label="Remove customized category"
                >
                    <Icon icon="mdi:close" width="16" height="16" />
                </button>
            </div>
        {/each}

        <!-- Add category button -->
        <button
            class="flex items-center justify-center w-8 h-8 rounded-[10px] border transition-colors bg-base-100 border-base-200 hover:border-base-300 text-base-content"
            on:click={openAddCategoryModal}
            aria-label="Add new category"
        >
            <Icon icon="mdi:plus" width="20" height="20" />
        </button>
    </div>

    <!-- Add Category Modal -->
    <dialog id="add-category-modal" class="modal">
        <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">Add new category</h3>
            <input
                type="text"
                class="input input-bordered w-full"
                placeholder="Type category name here..."
                bind:value={newCategoryTerm}
                on:keydown={handleAddCategoryKeyDown}
            />
            <div class="modal-action">
                <button class="btn" on:click={closeAddCategoryModal}>Cancel</button>
                <button class="btn btn-primary" on:click={addNewCategory} disabled={!newCategoryTerm.trim()}>Add</button>
            </div>
        </div>
        <!-- Backdrop to close on click outside -->
        <form method="dialog" class="modal-backdrop">
            <button on:click={closeAddCategoryModal}>close</button>
        </form>
    </dialog>
</div>
