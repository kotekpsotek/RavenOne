<script lang="ts">
    import Icon from "@iconify/svelte";

    type PickerTab = "emoji" | "icons" | "upload";

    type Props = {
        open: boolean;
        currentValue?: string;
        onClose: () => void;
        onSelect: (iconValue: string) => void;
        onRemove?: () => void;
    };

    let {
        open,
        currentValue = "",
        onClose,
        onSelect,
        onRemove
    }: Props = $props();

    const emojiItems = [
        "😀", "😃", "😄", "😁", "😆", "😊", "🙂", "😉", "😍", "😘", "😎", "🤩",
        "🤔", "😴", "🤯", "🥳", "😇", "🫡", "🤝", "🔥", "✨", "⭐", "✅", "❌",
        "📌", "📎", "📝", "📚", "📦", "🧠", "🚀", "💡", "⚙️", "🎯", "📊", "🔒"
    ];

    const iconItems = [
        "material-symbols:description-outline-rounded",
        "material-symbols:folder-outline-rounded",
        "material-symbols:task-outline-rounded",
        "material-symbols:check-circle-outline-rounded",
        "material-symbols:star-outline-rounded",
        "material-symbols:bookmark-outline-rounded",
        "material-symbols:bolt-rounded",
        "material-symbols:rocket-launch-outline-rounded",
        "material-symbols:edit-outline-rounded",
        "material-symbols:code-rounded",
        "material-symbols:terminal-rounded",
        "material-symbols:schedule-outline-rounded",
        "material-symbols:event-outline-rounded",
        "material-symbols:analytics-outline-rounded",
        "material-symbols:palette-outline-rounded",
        "material-symbols:build-outline-rounded",
        "material-symbols:chat-outline-rounded",
        "material-symbols:finance-outline-rounded",
        "material-symbols:travel-explore-rounded",
        "material-symbols:science-outline-rounded",
        "material-symbols:lightbulb-outline-rounded",
        "material-symbols:favorite-outline-rounded",
        "material-symbols:diamond-outline-rounded",
        "material-symbols:cloud-outline-rounded"
    ];

    let activeTab = $state<PickerTab>("emoji");
    let filterText = $state("");
    let uploadError = $state("");

    let filteredEmojiItems = $derived(
        emojiItems.filter((emoji) => emoji.includes(filterText.trim()))
    );

    let filteredIconItems = $derived(
        iconItems.filter((iconName) => iconName.toLowerCase().includes(filterText.trim().toLowerCase()))
    );

    function selectIconValue(iconValue: string) {
        onSelect(iconValue);
    }

    function onBackdropClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            onClose();
        }
    }

    function onWindowKeydown(event: KeyboardEvent) {
        if (!open) {
            return;
        }

        if (event.key === "Escape") {
            onClose();
        }
    }

    async function onUploadChange(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }

        const isSvgByName = file.name.toLowerCase().endsWith(".svg");
        const isSvgByType = file.type === "image/svg+xml";

        if (!isSvgByName && !isSvgByType) {
            uploadError = "Only SVG files are allowed.";
            input.value = "";
            return;
        }

        try {
            const svgContent = await file.text();
            const encoded = encodeURIComponent(svgContent);
            selectIconValue(`data:image/svg+xml;utf8,${encoded}`);
            uploadError = "";
            input.value = "";
        } catch {
            uploadError = "Could not read the SVG file. Please try again.";
            input.value = "";
        }
    }

    function resetFilter() {
        filterText = "";
    }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
    <div
        class="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
        onmousedown={onBackdropClick}
        role="presentation"
    >
        <div
            class="w-full max-w-2xl rounded-2xl border border-base-300 bg-base-100 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Icon selection modal"
        >
            <header class="flex items-center justify-between border-b border-base-300 px-4 py-3">
                <div class="tabs tabs-box bg-base-200/70 p-1">
                    <button
                        class={`tab tab-sm ${activeTab === "emoji" ? "tab-active" : ""}`}
                        onclick={() => {
                            activeTab = "emoji";
                            resetFilter();
                        }}
                    >
                        Emoji
                    </button>
                    <button
                        class={`tab tab-sm ${activeTab === "icons" ? "tab-active" : ""}`}
                        onclick={() => {
                            activeTab = "icons";
                            resetFilter();
                        }}
                    >
                        Icons
                    </button>
                    <button
                        class={`tab tab-sm ${activeTab === "upload" ? "tab-active" : ""}`}
                        onclick={() => {
                            activeTab = "upload";
                            resetFilter();
                        }}
                    >
                        Upload
                    </button>
                </div>

                <div class="flex items-center gap-2">
                    {#if onRemove && currentValue}
                        <button class="btn btn-ghost btn-sm" onclick={onRemove}>Remove</button>
                    {/if}

                    <button class="btn btn-ghost btn-square btn-sm" onclick={onClose} aria-label="Close icon picker">
                        <Icon icon="material-symbols:close-rounded" class="text-lg" />
                    </button>
                </div>
            </header>

            <div class="border-b border-base-300 px-4 py-3">
                {#if activeTab === "upload"}
                    <p class="text-sm text-base-content/70">Upload your own SVG icon file.</p>
                {:else}
                    <label class="input input-bordered input-sm flex items-center gap-2">
                        <Icon icon="material-symbols:search-rounded" class="text-base-content/60" />
                        <input
                            type="text"
                            class="grow"
                            bind:value={filterText}
                            placeholder={activeTab === "emoji" ? "Filter emoji..." : "Filter icon names..."}
                        />
                    </label>
                {/if}
            </div>

            <div class="max-h-[60vh] overflow-y-auto p-4">
                {#if activeTab === "emoji"}
                    <div class="grid grid-cols-8 gap-2 sm:grid-cols-10">
                        {#each filteredEmojiItems as emoji (emoji)}
                            <button
                                class="btn btn-ghost h-10 min-h-0 rounded-xl text-2xl"
                                onclick={() => selectIconValue(emoji)}
                                aria-label={`Select emoji ${emoji}`}
                            >
                                {emoji}
                            </button>
                        {/each}
                    </div>

                    {#if !filteredEmojiItems.length}
                        <p class="py-8 text-center text-sm text-base-content/60">No emoji match your filter.</p>
                    {/if}
                {:else if activeTab === "icons"}
                    <div class="grid grid-cols-4 gap-2 sm:grid-cols-6">
                        {#each filteredIconItems as iconName (iconName)}
                            <button
                                class="btn btn-ghost h-14 min-h-0 flex-col gap-1 rounded-xl"
                                onclick={() => selectIconValue(iconName)}
                                aria-label={`Select icon ${iconName}`}
                                title={iconName}
                            >
                                <Icon icon={iconName} class="text-2xl" />
                                <span class="max-w-full truncate text-[10px] text-base-content/70">{iconName.split(":")[1]}</span>
                            </button>
                        {/each}
                    </div>

                    {#if !filteredIconItems.length}
                        <p class="py-8 text-center text-sm text-base-content/60">No icons match your filter.</p>
                    {/if}
                {:else}
                    <div class="space-y-3">
                        <label class="flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-base-300 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-base-200/40">
                            <Icon icon="material-symbols:upload-file-rounded" class="mb-2 text-3xl text-base-content/70" />
                            <span class="text-sm font-medium">Choose SVG file</span>
                            <span class="mt-1 text-xs text-base-content/60">Only .svg files are supported</span>
                            <input type="file" class="hidden" accept=".svg,image/svg+xml" onchange={onUploadChange} />
                        </label>

                        {#if uploadError}
                            <div class="alert alert-error py-2 text-sm">{uploadError}</div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}