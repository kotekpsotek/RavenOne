<script lang="ts">
    import type { NodeViewProps } from "@tiptap/core";
    import Icon from "@iconify/svelte";
    import { NodeViewWrapper } from "svelte-tiptap";
    import { setAlert } from "$lib/utils/alert";
    import { deleteEditorImage, uploadEditorImage } from "../components/RavenImage.api";
    import { isEditable as isEditableLocal } from "../components/elements.edition";

    type UploadState = "empty" | "uploading" | "ready" | "error";

    type RavenImageAlignment = "left" | "center" | "right";

    type RavenImageNodeAttrs = {
        src?: string;
        alt?: string;
        title?: string;
        width?: number;
        height?: number;
        objectKey?: string;
        uploadState?: UploadState;
        uploadId?: string;
        align?: RavenImageAlignment;
    };

    const DEFAULT_WIDTH = 640;
    const DEFAULT_HEIGHT = 360;
    const MIN_WIDTH = 180;
    const MIN_HEIGHT = 120;

    let { node, editor: editorLocal, updateAttributes, getPos }: NodeViewProps = $props();

    let isEditable = $derived($isEditableLocal);
    let fileInput: HTMLInputElement | null = null;
    let isHovered = $state(false);
    let isBusy = $state(false);
    let isResizing = $state(false);
    let isAlignMenuOpen = $state(false);
    let dragPreview = $state<{ width: number; height: number } | null>(null);
    let suppressSurfaceClickUntil = $state(0);

    let attrs = $derived((node.attrs ?? {}) as RavenImageNodeAttrs);
    let uploadState = $derived((attrs.uploadState ?? (attrs.src ? "ready" : "empty")) as UploadState);
    let imageSource = $derived((attrs.src ?? "").trim());
    let objectKey = $derived((attrs.objectKey ?? "").trim());
    let imageAlignment = $derived(normalizeAlignment(attrs.align));
    let isLoading = $derived(uploadState === "uploading" || isBusy);
    let hasImage = $derived(Boolean(imageSource));

    let persistedWidth = $derived(normalizeDimension(attrs.width, DEFAULT_WIDTH));
    let persistedHeight = $derived(normalizeDimension(attrs.height, DEFAULT_HEIGHT));

    let displayWidth = $derived(dragPreview?.width ?? persistedWidth);
    let displayHeight = $derived(dragPreview?.height ?? persistedHeight);

    function normalizeDimension(value: unknown, fallback: number): number {
        const fromNumber = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(fromNumber) || fromNumber <= 0) {
            return fallback;
        }

        return Math.round(fromNumber);
    }

    function clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max);
    }

    function normalizeAlignment(value: unknown): RavenImageAlignment {
        return value === "left" || value === "center" || value === "right" ? value : "center";
    }

    function getAlignmentIcon(alignment: RavenImageAlignment): string {
        if (alignment === "left") {
            return "material-symbols:format-align-left-rounded";
        }

        if (alignment === "right") {
            return "material-symbols:format-align-right-rounded";
        }

        return "material-symbols:format-align-center-rounded";
    }

    function closeAlignMenu(event: FocusEvent) {
        const currentTarget = event.currentTarget as HTMLElement | null;
        const relatedTarget = event.relatedTarget;

        if (currentTarget && relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) {
            return;
        }

        isAlignMenuOpen = false;
    }

    function getSourceFileName(source: string): string | null {
        try {
            const parsedUrl = new URL(source, window.location.href);
            const lastSegment = parsedUrl.pathname.split("/").filter(Boolean).pop();
            return lastSegment ? decodeURIComponent(lastSegment) : null;
        } catch {
            const fallback = source.split("/").filter(Boolean).pop();
            return fallback ? fallback.split("?")[0].split("#")[0] : null;
        }
    }

    function getDownloadExtension(source: string): string {
        const sourceFileName = getSourceFileName(source);
        if (sourceFileName && sourceFileName.includes(".")) {
            const extension = sourceFileName.split(".").pop();
            if (extension && extension.length <= 8) {
                return extension.toLowerCase();
            }
        }

        const dataUrlMatch = source.match(/^data:image\/([a-z0-9.+-]+)[;,]/i);
        if (dataUrlMatch?.[1]) {
            return dataUrlMatch[1].toLowerCase();
        }

        return "png";
    }

    function getDownloadFileName(source: string): string {
        const sourceFileName = getSourceFileName(source);
        if (sourceFileName) {
            return sourceFileName.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_").trim() || "image";
        }

        const preferredName = (attrs.title ?? attrs.alt ?? objectKey ?? "image").trim();
        const sanitizedName = preferredName.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_").replace(/\s+/g, " ").trim() || "image";
        const extension = getDownloadExtension(source);

        return sanitizedName.toLowerCase().endsWith(`.${extension}`) ? sanitizedName : `${sanitizedName}.${extension}`;
    }

    async function downloadImageSource(source: string) {
        const fileName = getDownloadFileName(source);

        try {
            const response = await fetch(source, { credentials: "include" });
            if (!response.ok) {
                throw new Error(`Image request failed with ${response.status}`);
            }

            const imageBlob = await response.blob();
            if (!imageBlob.size) {
                throw new Error("The downloaded image was empty");
            }

            const objectUrl = URL.createObjectURL(imageBlob);
            try {
                const downloadLink = document.createElement("a");
                downloadLink.href = objectUrl;
                downloadLink.download = fileName;
                downloadLink.rel = "noopener";
                downloadLink.style.display = "none";

                document.body.append(downloadLink);
                downloadLink.click();
                downloadLink.remove();
            } finally {
                URL.revokeObjectURL(objectUrl);
            }
        } catch {
            const downloadLink = document.createElement("a");
            downloadLink.href = source;
            downloadLink.download = fileName;
            downloadLink.rel = "noopener";
            downloadLink.style.display = "none";

            document.body.append(downloadLink);
            downloadLink.click();
            downloadLink.remove();
        }
    }

    function asErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        if (typeof error === "string") {
            return error;
        }

        try {
            return JSON.stringify(error);
        } catch {
            return "Unknown image operation error";
        }
    }

    function triggerFileSelection(event?: Event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (!isEditable || isLoading) {
            return;
        }

        fileInput?.click();
    }

    function captureFileInput(node: HTMLInputElement) {
        fileInput = node;

        return () => {
            if (fileInput === node) {
                fileInput = null;
            }
        };
    }

    async function onInputChange(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const candidate = input.files?.[0];
        input.value = "";

        if (!candidate) {
            return;
        }

        if (!candidate.type.startsWith("image/")) {
            setAlert("error", "Invalid file type", "Only image files are allowed.");
            return;
        }

        await replaceImage(candidate);
    }

    async function replaceImage(file: File) {
        const previousObjectKey = objectKey;

        isBusy = true;
        updateAttributes({ uploadState: "uploading" });

        try {
            const uploaded = await uploadEditorImage(file);
            const hasUploadedDimensions = uploaded.width > 0 && uploaded.height > 0;

            updateAttributes({
                src: uploaded.imageUrl,
                objectKey: uploaded.objectKey,
                width: hasUploadedDimensions ? uploaded.width : persistedWidth,
                height: hasUploadedDimensions ? uploaded.height : persistedHeight,
                uploadState: "ready",
                uploadId: ""
            });

            if (previousObjectKey && previousObjectKey !== uploaded.objectKey) {
                await deleteEditorImage({ objectKey: previousObjectKey }).catch((error) => {
                    console.error("Cannot delete replaced image", error);
                });
            }
        } catch (error) {
            const message = asErrorMessage(error);
            updateAttributes({ uploadState: "error" });
            setAlert("error", "Image upload failed", message);
        } finally {
            isBusy = false;
        }
    }

    async function onRemoveImage(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        if (!isEditable || isLoading) {
            return;
        }

        isBusy = true;

        try {
            if (objectKey || imageSource) {
                await deleteEditorImage({
                    objectKey,
                    imageUrl: imageSource
                });
            }

            const nodePosition = getPos();
            if (typeof nodePosition === "number") {
                const tr = editorLocal.state.tr.delete(nodePosition, nodePosition + node.nodeSize);
                editorLocal.view.dispatch(tr.scrollIntoView());
            }
        } catch (error) {
            setAlert("error", "Image delete failed", asErrorMessage(error));
        } finally {
            isBusy = false;
        }
    }

    function onAlignImage(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        if (!isEditable || !hasImage || isLoading) {
            return;
        }

        isAlignMenuOpen = !isAlignMenuOpen;
    }

    function setImageAlignment(event: MouseEvent, alignment: RavenImageAlignment) {
        event.preventDefault();
        event.stopPropagation();

        if (!isEditable || !hasImage || isLoading) {
            return;
        }

        updateAttributes({
            align: alignment
        });

        isAlignMenuOpen = false;
    }

    async function onDownloadImage(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        if (!hasImage || isLoading) {
            return;
        }

        try {
            await downloadImageSource(imageSource);
        } catch (error) {
            setAlert("error", "Image download failed", asErrorMessage(error));
        }
    }
    
    function onSurfaceClick(event: MouseEvent) {
        if (Date.now() <= suppressSurfaceClickUntil) {
            event.preventDefault();
            event.stopPropagation();
            suppressSurfaceClickUntil = 0;
            return;
        }

        if (!isEditable || isResizing || isLoading) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        triggerFileSelection();
    }

    function onSurfaceKeyDown(event: KeyboardEvent) {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }

        onSurfaceClick(event as unknown as MouseEvent);
    }

    function startResize(event: MouseEvent, direction: -1 | 1) {
        if (!isEditable || !hasImage || isLoading) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const initialWidth = normalizeDimension(attrs.width, DEFAULT_WIDTH);
        const initialHeight = normalizeDimension(attrs.height, DEFAULT_HEIGHT);
        const aspectRatio = initialWidth / Math.max(1, initialHeight);
        const startX = event.clientX;

        const editorArea = (event.currentTarget as HTMLElement).closest(".tiptap-editorLocal") as HTMLElement | null;
        const maxWidth = Math.max(MIN_WIDTH, (editorArea?.clientWidth ?? 1100) - 24);

        isResizing = true;

        const onMouseMove = (moveEvent: MouseEvent) => {
            moveEvent.stopPropagation();
            
            const delta = (moveEvent.clientX - startX) * direction;
            const nextWidth = clamp(Math.round(initialWidth + delta), MIN_WIDTH, maxWidth);
            const nextHeight = Math.max(MIN_HEIGHT, Math.round(nextWidth / Math.max(0.001, aspectRatio)));
            dragPreview = {
                width: nextWidth,
                height: nextHeight
            };
        };

        const onMouseUp = (mouseEvent: MouseEvent) => {
            mouseEvent.stopPropagation();
            
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            isResizing = false;
            suppressSurfaceClickUntil = Date.now() + 250;

            if (dragPreview) {
                updateAttributes({
                    width: dragPreview.width,
                    height: dragPreview.height
                });
            }

            dragPreview = null;
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }
</script>

<NodeViewWrapper>
    <div
        class="group relative my-[0.45rem] w-fit max-w-full"
        class:mx-auto={imageAlignment === "center"}
        class:ml-auto={imageAlignment === "right"}
        contenteditable="false"
        role="group"
        aria-label="editorLocal image block"
        onmouseenter={() => (isHovered = true)}
        onmouseleave={() => (isHovered = false)}
    >
        <div
            class="relative block max-w-full cursor-pointer overflow-hidden rounded-[18px] border border-slate-300/70 bg-[radial-gradient(circle_at_30%_20%,rgba(248,250,252,0.98),rgba(226,232,240,0.94))] dark:border-white/10 dark:bg-[radial-gradient(circle_at_30%_20%,rgba(34,38,44,0.95),rgba(18,20,24,0.98))]"
            style={`width:${displayWidth}px;height:${displayHeight}px;`}
            role="button"
            aria-label="Select image"
            tabindex={isEditable ? 0 : -1}
            onclick={onSurfaceClick}
            onkeydown={onSurfaceKeyDown}
        >
            {#if hasImage}
                <img
                    class="pointer-events-none block select-none rounded-[inherit] object-cover"
                    src={imageSource}
                    alt={attrs.alt ?? "Image"}
                    title={attrs.title ?? ""}
                    draggable="false"
                    style={`width:${displayWidth}px;height:${displayHeight}px;`}
                />
            {:else}
                <div class="flex h-full w-full items-center justify-center bg-[linear-gradient(130deg,rgba(248,250,252,0.98),rgba(226,232,240,0.92))] text-slate-600 dark:bg-[linear-gradient(130deg,rgba(27,29,35,0.96),rgba(18,18,22,0.98))] dark:text-slate-100">
                    <Icon icon="material-symbols:image-outline-rounded" width="78" height="78" />
                </div>
            {/if}

            {#if isLoading}
                <div class="absolute bottom-3 right-3 z-[5] inline-flex items-center gap-2 rounded-full border border-slate-300/80 bg-white/85 px-2.5 py-1.5 text-[0.86rem] leading-none text-slate-700 backdrop-blur dark:border-white/15 dark:bg-slate-950/80 dark:text-slate-100">
                    <div class="h-4 w-4 animate-spin rounded-full border-2 border-slate-400/60 border-t-slate-700 dark:border-slate-500/50 dark:border-t-white" aria-hidden="true"></div>
                    <span>Preparing...</span>
                </div>
            {/if}

            {#if isEditable && hasImage}
                <button
                    type="button"
                    class="absolute left-2.5 top-1/2 z-[7] h-[62px] w-2 -translate-y-1/2 cursor-ew-resize rounded-full border border-slate-300/90 bg-slate-100/85 opacity-0 shadow-[0_0_0_1px_rgba(148,163,184,0.35),0_8px_12px_rgba(15,23,42,0.18)] transition-opacity group-hover:opacity-100 dark:border-white/45 dark:bg-white/20 dark:shadow-[0_0_0_1px_rgba(0,0,0,0.24),0_8px_12px_rgba(0,0,0,0.32)]"
                    class:opacity-100={isLoading}
                    aria-label="Resize image from left"
                    onmousedown={(event) => startResize(event, -1)}
                    onclick={event => event.stopPropagation()}
                ></button>

                <button
                    type="button"
                    class="absolute right-2.5 top-1/2 z-[7] h-[62px] w-2 -translate-y-1/2 cursor-ew-resize rounded-full border border-slate-300/90 bg-slate-100/85 opacity-0 shadow-[0_0_0_1px_rgba(148,163,184,0.35),0_8px_12px_rgba(15,23,42,0.18)] transition-opacity group-hover:opacity-100 dark:border-white/45 dark:bg-white/20 dark:shadow-[0_0_0_1px_rgba(0,0,0,0.24),0_8px_12px_rgba(0,0,0,0.32)]"
                    class:opacity-100={isLoading}
                    aria-label="Resize image from right"
                    onmousedown={(event) => startResize(event, 1)}
                    onclick={event => event.stopPropagation()}
                ></button>
            {/if}
        </div>

        {#if (isHovered || !hasImage || uploadState === "error")}
            <div class="image-manipulation absolute right-2.5 top-2.5 z-[10] inline-flex items-start gap-0.5 rounded-lg border border-white/50 bg-[#4f4f4f]/50 p-0.5">
                {#if isEditable}
                    <button
                        type="button"
                        class="toolbar-button"
                        onclick={triggerFileSelection}
                        disabled={isLoading}
                        title={hasImage ? "Change image" : "Select image"}
                    >
                        <Icon icon="material-symbols:edit-outline" />
                    </button>
                {/if}

                {#if hasImage}
                    {#if isEditable}
                        <div
                            class="dropdown dropdown-bottom dropdown-end"
                            class:dropdown-open={isAlignMenuOpen}
                            onfocusout={closeAlignMenu}
                        >
                            <button
                                type="button"
                                class="toolbar-button"
                                onclick={onAlignImage}
                                disabled={isLoading}
                                aria-haspopup="menu"
                                aria-expanded={isAlignMenuOpen}
                                title="Align image"
                            >
                                <Icon icon={getAlignmentIcon(imageAlignment)} />
                            </button>

                            <ul class="dropdown-content menu z-[999] mt-2 w-40 rounded-box border border-base-300 bg-base-100 p-1 shadow-xl">
                                <li>
                                    <button
                                        type="button"
                                        class="btn btn-sm justify-start gap-2"
                                        class:btn-primary={imageAlignment === "left"}
                                        class:btn-ghost={imageAlignment !== "left"}
                                        onclick={(event) => setImageAlignment(event, "left")}
                                    >
                                        <Icon icon="material-symbols:format-align-left-rounded" width="18" height="18" />
                                        <span>Left</span>
                                    </button>
                                </li>
                                <li>
                                    <button
                                        type="button"
                                        class="btn btn-sm justify-start gap-2"
                                        class:btn-primary={imageAlignment === "center"}
                                        class:btn-ghost={imageAlignment !== "center"}
                                        onclick={(event) => setImageAlignment(event, "center")}
                                    >
                                        <Icon icon="material-symbols:format-align-center-rounded" width="18" height="18" />
                                        <span>Center</span>
                                    </button>
                                </li>
                                <li>
                                    <button
                                        type="button"
                                        class="btn btn-sm justify-start gap-2"
                                        class:btn-primary={imageAlignment === "right"}
                                        class:btn-ghost={imageAlignment !== "right"}
                                        onclick={(event) => setImageAlignment(event, "right")}
                                    >
                                        <Icon icon="material-symbols:format-align-right-rounded" width="18" height="18" />
                                        <span>Right</span>
                                    </button>
                                </li>
                            </ul>
                        </div>
                    {/if}

                    <button
                        type="button"
                        class="toolbar-button"
                        onclick={onDownloadImage}
                        disabled={isLoading}
                        title="Download image"
                    >
                        <Icon icon="material-symbols:downloading-rounded" />
                    </button>

                    {#if isEditable}
                        <button
                            type="button"
                            class="toolbar-button"
                            onclick={onRemoveImage}
                            disabled={isLoading}
                            title="Remove image"
                        >
                            <Icon icon="material-symbols:delete-outline-rounded" />
                        </button>
                    {/if}
                {/if}
            </div>
        {/if}

        <input
            {@attach captureFileInput}
            type="file"
            accept="image/*"
            class="hidden"
            onchange={onInputChange}
        />
    </div>
</NodeViewWrapper>

<style>
    @reference "../../../app.css";

    .toolbar-button {
        @apply cursor-pointer rounded-lg p-1.5 px-2 text-sm text-white/70 transition-all duration-75;
    }

    .toolbar-button:hover {
        @apply border-white/70 bg-white/30;
    }
</style>
