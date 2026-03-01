<script lang="ts">
    import Icon from "@iconify/svelte";

    type WallpaperTab = "gallery" | "upload" | "link";

    type Props = {
        open: boolean;
        currentValue?: string;
        onClose: () => void;
        onSelect: (wallpaperValue: string) => void;
        onRemove?: () => void;
    };

    let {
        open,
        currentValue = "",
        onClose,
        onSelect,
        onRemove
    }: Props = $props();

    const gradientItems = [
        "#ea5455,#f07b7d",
        "#f2c14e,#f39f86",
        "#2f97c1,#8ad4eb",
        "#d9cbbc,#f1e6da",
        "#45b9b7,#c9b5ac",
        "#f53f94,#ff6b9a",
        "#eb5b3f,#f4281f",
        "#6aa1d4,#d9b5a0"
    ];

    const imageItems = [
        "https://images-assets.nasa.gov/image/PIA04252/PIA04252~orig.jpg",
        "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001679/GSFC_20171208_Archive_e001679~orig.jpg",
        "https://images-assets.nasa.gov/image/PIA12235/PIA12235~orig.jpg",
        "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001549/GSFC_20171208_Archive_e001549~orig.jpg",
        "https://images-assets.nasa.gov/image/iss066e038430/iss066e038430~orig.jpg",
        "https://images-assets.nasa.gov/image/iss066e080704/iss066e080704~orig.jpg",
        "https://images-assets.nasa.gov/image/PIA12228/PIA12228~orig.jpg",
        "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001866/GSFC_20171208_Archive_e001866~orig.jpg"
    ];

    let activeTab = $state<WallpaperTab>("gallery");
    let linkValue = $state("");
    let uploadError = $state("");
    let linkError = $state("");

    function selectWallpaper(value: string) {
        onSelect(value);
    }

    function toGradientDataUrl(gradientPair: string) {
        const [start, end] = gradientPair.split(",");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${start}"/><stop offset="100%" stop-color="${end}"/></linearGradient></defs><rect width="1200" height="600" fill="url(#g)"/></svg>`;
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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

        if (!file.type.startsWith("image/")) {
            uploadError = "Only image files are allowed.";
            input.value = "";
            return;
        }

        try {
            const dataUrl = await readFileAsDataUrl(file);
            uploadError = "";
            input.value = "";
            selectWallpaper(dataUrl);
        } catch {
            uploadError = "Could not read the image file. Please try again.";
            input.value = "";
        }
    }

    function readFileAsDataUrl(file: File) {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(file);
        });
    }

    function submitLink() {
        const trimmed = linkValue.trim();
        if (!trimmed) {
            linkError = "Please enter an image URL.";
            return;
        }

        try {
            const parsed = new URL(trimmed);
            if (!["http:", "https:", "data:"].includes(parsed.protocol)) {
                linkError = "Only http, https, or data URLs are allowed.";
                return;
            }
        } catch {
            if (!trimmed.startsWith("data:image/")) {
                linkError = "Please enter a valid image URL.";
                return;
            }
        }

        linkError = "";
        selectWallpaper(trimmed);
    }

    function changeTab(nextTab: WallpaperTab) {
        activeTab = nextTab;
        uploadError = "";
        linkError = "";
    }

    function onRemoveClick() {
        if (!onRemove) {
            return;
        }

        onRemove();
    }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
    <div
        class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
        onmousedown={onBackdropClick}
        role="presentation"
    >
        <div
            class="w-full max-w-4xl overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Wallpaper selection modal"
        >
            <header class="flex items-center justify-between border-b border-base-300 px-4 py-3">
                <div class="tabs tabs-box bg-base-200/70 p-1">
                    <button
                        class={`tab tab-sm ${activeTab === "gallery" ? "tab-active" : ""}`}
                        onclick={() => changeTab("gallery")}
                    >
                        Gallery
                    </button>
                    <button
                        class={`tab tab-sm ${activeTab === "upload" ? "tab-active" : ""}`}
                        onclick={() => changeTab("upload")}
                    >
                        Upload
                    </button>
                    <button
                        class={`tab tab-sm ${activeTab === "link" ? "tab-active" : ""}`}
                        onclick={() => changeTab("link")}
                    >
                        Link
                    </button>
                </div>

                <div class="flex items-center gap-2">
                    {#if onRemove && currentValue}
                        <button class="btn btn-ghost btn-sm" onclick={onRemoveClick}>Remove</button>
                    {/if}

                    <button class="btn btn-ghost btn-square btn-sm" onclick={onClose} aria-label="Close wallpaper picker">
                        <Icon icon="material-symbols:close-rounded" class="text-lg" />
                    </button>
                </div>
            </header>

            <div class="max-h-[70vh] overflow-y-auto p-4">
                {#if activeTab === "gallery"}
                    <div class="space-y-6">
                        <section>
                            <h6 class="mb-3 text-sm font-medium text-base-content/70">Color & Gradient</h6>
                            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {#each gradientItems as gradientPair, index (`gradient-${index}`)}
                                    <button
                                        class="h-20 rounded-lg border border-base-300 transition-transform hover:scale-[1.02]"
                                        style={`background-image: linear-gradient(135deg, ${gradientPair.replace(',', ', ')});`}
                                        onclick={() => selectWallpaper(toGradientDataUrl(gradientPair))}
                                        aria-label="Select gradient wallpaper"
                                    ></button>
                                {/each}
                            </div>
                        </section>

                        <section>
                            <h6 class="mb-3 text-sm font-medium text-base-content/70">NASA Archive</h6>
                            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {#each imageItems as imageUrl (imageUrl)}
                                    <button
                                        class="group relative h-20 overflow-hidden rounded-lg border border-base-300"
                                        onclick={() => selectWallpaper(imageUrl)}
                                        aria-label="Select image wallpaper"
                                    >
                                        <img
                                            src={imageUrl}
                                            alt="Wallpaper preview"
                                            class="h-full w-full object-cover transition-transform group-hover:scale-105"
                                            loading="lazy"
                                        />
                                    </button>
                                {/each}
                            </div>
                        </section>
                    </div>
                {:else if activeTab === "upload"}
                    <div class="space-y-3">
                        <label class="flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-base-300 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-base-200/40">
                            <Icon icon="material-symbols:upload-file-rounded" class="mb-2 text-3xl text-base-content/70" />
                            <span class="text-sm font-medium">Choose image file</span>
                            <span class="mt-1 text-xs text-base-content/60">PNG, JPG, WEBP, SVG and other image types are supported</span>
                            <input type="file" class="hidden" accept="image/*" onchange={onUploadChange} />
                        </label>

                        {#if uploadError}
                            <div class="alert alert-error py-2 text-sm">{uploadError}</div>
                        {/if}
                    </div>
                {:else}
                    <div class="space-y-3">
                        <label class="form-control w-full">
                            <div class="label py-1">
                                <span class="label-text text-sm text-base-content/70">Image URL</span>
                            </div>
                            <input
                                type="url"
                                class="input input-bordered w-full"
                                bind:value={linkValue}
                                placeholder="https://example.com/cover.jpg"
                            />
                        </label>

                        <div class="flex justify-end">
                            <button class="btn btn-primary btn-sm" onclick={submitLink}>Apply link</button>
                        </div>

                        {#if linkError}
                            <div class="alert alert-error py-2 text-sm">{linkError}</div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}