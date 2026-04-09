<script lang="ts">
    import Icon from "@iconify/svelte";
    import { avaiableModels } from "./config/models";
    import { selectedFile } from "./stores/files";
    import { selectedModel } from "./stores/files";
    import { selectedWorkspace } from "./stores/workspace";
    import { tick } from "svelte";
    import { contextSpecification } from "./stores/contextSpec";
    import { mcpConfigurationStore } from "./stores/mcpConfig";
    import { alertState } from "./utils/alert";
    import { get, writable } from "svelte/store";
    import McpSelectionModal from "./modals/McpSelectionModal.svelte";
    import ContextSelectionModal from "./modals/ContextSelectionModal.svelte";
    import SaveFile from "./components/SaveFile.svelte";
    import { shareFileRequest } from "./files/connections/connections";
    import { File } from "@ravenlens/shared";
    import { browser } from "$app/environment";

    type DropdownName = "model-settings" | "mcp-tools" | "play-settings" | "share";

    let isDownloadingPdf = $state(false);

    const selectedModelKey = (() => {
        const initialModelKey = avaiableModels[0]?.model ?? "";
        const selectedModelName = writable<string>(initialModelKey);

        if (browser) {
            const model = localStorage.getItem("localSelectedLLM");
            selectedModelName.set(model ?? initialModelKey);
        }

        return {
            ...selectedModelName,
            set(model: string) {
                if (browser) {
                    localStorage.setItem('localSelectedLLM', model);
                }
                
                selectedModelName.set(model ?? initialModelKey);
            }
        }
    })();
    let mcpConfigurationDraft = $state(get(mcpConfigurationStore));
    let mcpConfigurationError = $state("");

    let openDropdown = $state<DropdownName | undefined>(undefined);

    let isContextModalOpen = $state(false);
    let isMcpConfigModalOpen = $state(false);
    let contextModalPayloadDraft = $state<File.FileAI.ContextSpecificationPayload>({
        desktopFiles: [],
        editorFiles: [],
        networkUrls: []
    });
    let generatedShareUrl = $state("");
    let isShareLinkGenerating = $state(false);
    const shareUrl = $derived(generatedShareUrl);

    const getModelByKey = (key: string) =>
        avaiableModels.find((model) => model.model === key);

    const currentModel = $derived(getModelByKey($selectedModelKey));
    $effect(() => {
        $selectedModel = currentModel;
    });

    function onDropdownToggle(name: DropdownName, event: Event) {
        const target = event.currentTarget as HTMLDetailsElement;

        if (target.open) {
            openDropdown = name;
            return;
        }

        if (openDropdown === name) {
            openDropdown = undefined;
        }
    }

    function onWindowClick(event: MouseEvent) {
        if (!openDropdown) {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (!target) {
            return;
        }

        if (target.closest("details.dropdown")) {
            return;
        }

        openDropdown = undefined;
    }

    function onSaveGlobalContext(payload: File.FileAI.ContextSpecificationPayload) {
        contextSpecification.set(payload);
        isContextModalOpen = false;
    }

    async function generateShareUrl() {
        const selectedFileLocal = get(selectedFile);
        const selectedWorkspaceLocal = get(selectedWorkspace);
        const workspaceId = selectedWorkspaceLocal?.id?.trim() || selectedFileLocal?.createdByAuthorId?.trim();

        if (!selectedFileLocal?.id || !workspaceId) {
            alertState.set({
                alert: {
                    name: "Cannot share file",
                    description: "Select a file inside a workspace before sharing.",
                    type: "warning"
                },
                timeoutMs: 3_500
            });
            return;
        }

        isShareLinkGenerating = true;
        try {
            const response = await shareFileRequest(workspaceId, selectedFileLocal.id);
            const nextShareUrl = response?.shareUrl?.trim();

            if (nextShareUrl) {
                generatedShareUrl = nextShareUrl;
            }
        } finally {
            isShareLinkGenerating = false;
        }
    }

    async function onShareButtonClick(event: MouseEvent) {
        const summary = event.currentTarget as HTMLElement | null;
        const details = summary?.closest("details");

        if (!(details instanceof HTMLDetailsElement)) {
            return;
        }

        // Generate a fresh link only when opening the dropdown.
        if (!details.open) {
            await generateShareUrl();
        }
    }

    async function copyShareUrl() {
        const nextShareUrl = shareUrl;
        if (!nextShareUrl) {
            alertState.set({
                alert: {
                    name: "Share link unavailable",
                    description: "No share URL is available right now.",
                    type: "warning"
                },
                timeoutMs: 2500
            });
            return;
        }

        try {
            await navigator.clipboard.writeText(nextShareUrl);
            alertState.set({
                alert: {
                    name: "Link copied",
                    description: "Share URL copied to clipboard.",
                    type: "success"
                },
                timeoutMs: 2200
            });
        } catch {
            const textarea = document.createElement("textarea");
            textarea.value = nextShareUrl;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.append(textarea);
            textarea.select();
            const copied = document.execCommand("copy");
            textarea.remove();

            alertState.set({
                alert: {
                    name: copied ? "Link copied" : "Copy failed",
                    description: copied
                        ? "Share URL copied to clipboard."
                        : "Could not copy the share URL.",
                    type: copied ? "success" : "error"
                },
                timeoutMs: copied ? 2200 : 3500
            });
        }
    }

    function getSocialShareUrl(platform: "facebook" | "x" | "whatsapp" | "telegram" | "linkedin") {
        const encodedUrl = encodeURIComponent(shareUrl);
        if (!encodedUrl) {
            return;
        }

        switch (platform) {
            case "facebook":
                return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
            case "x":
                return `https://x.com/intent/tweet?url=${encodedUrl}`;
            case "whatsapp":
                return `https://wa.me/?text=${encodedUrl}`;
            case "telegram":
                return `https://t.me/share/url?url=${encodedUrl}`;
            case "linkedin":
                return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
        }
    }

    function openSocialShare(platform: "facebook" | "x" | "whatsapp" | "telegram" | "linkedin") {
        const socialShareUrl = getSocialShareUrl(platform);
        if (!socialShareUrl) {
            return;
        }

        window.open(socialShareUrl, "_blank", "noopener,noreferrer");
    }

    function closeShareDropdown() {
        if (openDropdown === "share") {
            openDropdown = undefined;
        }
    }

    function collectCurrentPageStyles(): string {
        let styles = "";

        for (const styleSheet of Array.from(document.styleSheets)) {
            try {
                const cssRules = (styleSheet as CSSStyleSheet).cssRules;
                if (cssRules) {
                    styles += Array.from(cssRules)
                        .map((rule) => rule.cssText)
                        .join("\n");
                }
            } catch {
                // For cross-origin stylesheets where cssRules are inaccessible,
                // keep the stylesheet reference so the exported HTML can still load it.
                const href = (styleSheet as CSSStyleSheet).href;
                if (href) {
                    styles += `\n@import url("${href}");`;
                }
            }
        }

        return styles;
    }

    async function onDownloadHTML() {
        if (isDownloadingPdf) {
            return;
        }

        if (typeof window === "undefined" || typeof document === "undefined") {
            return;
        }

        isDownloadingPdf = true;

        try {
            // Ensure dropdowns are closed before taking the HTML snapshot.
            openDropdown = undefined;
            await tick();

            const selectedFileName = ($selectedFile?.name?.trim() || document.title || "webpage")
                .replace(/[\\/:*?"<>|]+/g, "-");
            const pageMarkup = document.documentElement.outerHTML;
            const serializedStyles = collectCurrentPageStyles();

            const withInjectedStyles = pageMarkup.includes("</head>")
                ? pageMarkup.replace("</head>", `<style id=\"exported-inline-styles\">${serializedStyles}</style></head>`)
                : `<!doctype html><html><head><style id=\"exported-inline-styles\">${serializedStyles}</style></head><body>${pageMarkup}</body></html>`;

            const htmlBlob = new Blob([withInjectedStyles], { type: "text/html;charset=utf-8" });
            const objectUrl = URL.createObjectURL(htmlBlob);

            const downloadLink = document.createElement("a");
            downloadLink.href = objectUrl;
            downloadLink.download = `${selectedFileName}.html`;
            downloadLink.style.display = "none";

            document.body.append(downloadLink);
            downloadLink.click();
            downloadLink.remove();
            URL.revokeObjectURL(objectUrl);

            alertState.set({
                alert: {
                    name: "HTML downloaded",
                    description: "The current page has been downloaded as HTML with styles.",
                    type: "success"
                },
                timeoutMs: 2500
            });
        } catch (error) {
            console.error("HTML download failed:", error);
            alertState.set({
                alert: {
                    name: "HTML download failed",
                    description: "Could not download the current page as HTML.",
                    type: "error"
                },
                timeoutMs: 3500
            });
        } finally {
            isDownloadingPdf = false;
        }
    }
</script>

<svelte:window onclick={onWindowClick} />

{#if $selectedFile}
    <section
        id="upperstripe"
        class="border-b border-base-300 bg-base-100 flex items-center justify-between px-4 py-2 transition-colors"
    >
        <div class="right-side flex items-center gap-2">
            <SaveFile/>
        </div>

        <div 
            class="left-side flex gap-7 items-center"
        >
            <details
                class="dropdown dropdown-end"
                open={openDropdown === "share"}
                ontoggle={(event) => onDropdownToggle("share", event)}
            >
                <summary class="btn btn-sm theme-dark:bg-sky-700 bg-sky-400 font-bold text-white" onclick={onShareButtonClick}>
                    <Icon icon="material-symbols:share"/>
                    <span>
                        Share
                    </span>
                </summary>
                
                <div class="dropdown-content z-[20] mr-3 mt-10 w-[17rem] max-w-[88vw]">
                    <div class="relative rounded-2xl border border-base-300 bg-base-100 px-4 pb-4 pt-8 shadow-xl">
                        <div class="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-base-300 bg-base-200 p-3">
                            <Icon icon="material-symbols:link-rounded" class="h-6 w-6" />
                        </div>

                        <button
                            class="btn btn-ghost btn-circle btn-xs absolute right-3 top-3"
                            type="button"
                            aria-label="Close share dialog"
                            title="Close"
                            onclick={closeShareDropdown}
                        >
                            <Icon icon="material-symbols:close-rounded" class="h-4 w-4" />
                        </button>

                        <div class="space-y-1 text-center">
                            <h4 class="text-2xl font-semibold">Share with Team</h4>
                            <p class="mx-auto max-w-[11rem] text-sm opacity-80">Send results of your research to Team!</p>
                        </div>

                        <div class="mt-5 space-y-2">
                            <p class="text-base font-semibold">Share your link</p>
                            <div class="flex h-10 items-center rounded-xl bg-base-200 pl-3 pr-1 gap-1">
                                {#if isShareLinkGenerating}
                                    <span class="loading loading-spinner loading-xs"></span>
                                {/if}
                                <input
                                    class="h-full w-full bg-transparent text-xs outline-none border-none shadow-none active:outline-none focus:border-none"
                                    readonly
                                    value={shareUrl}
                                />
                                <button
                                    class="btn btn-ghost btn-circle btn-xs"
                                    onclick={copyShareUrl}
                                    aria-label="Copy share URL"
                                    title="Copy share URL"
                                    disabled={!shareUrl || isShareLinkGenerating}
                                >
                                    <Icon icon="material-symbols:content-copy-outline-rounded" class="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div class="mt-5 space-y-2">
                            <p class="text-base font-semibold">Share to</p>
                            <div class="grid grid-cols-5 gap-1 text-center">
                                <button
                                    class="space-y-1 disabled:opacity-40"
                                    onclick={onDownloadHTML}
                                    disabled={isDownloadingPdf}
                                    title="Download HTML"
                                    aria-label="Download HTML"
                                >
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="material-symbols:code-blocks-outline-rounded" class="w-5 h-5 text-info" />
                                    </span>
                                    <span class="text-[10px]">HTML</span>
                                </button>
                                <button class="space-y-1 disabled:opacity-40" type="button" title="Share to Facebook" onclick={() => openSocialShare("facebook")} disabled={!shareUrl || isShareLinkGenerating}>
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="logos:facebook" class="h-6 w-6" />
                                    </span>
                                    <span class="text-[10px]">Facebook</span>
                                </button>
                                <button class="space-y-1 disabled:opacity-40" type="button" title="Share to X" onclick={() => openSocialShare("x")} disabled={!shareUrl || isShareLinkGenerating}>
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="simple-icons:x" class="h-4 w-4" />
                                    </span>
                                    <span class="text-[10px]">X</span>
                                </button>
                                <button class="space-y-1 disabled:opacity-40" type="button" title="Share to Whatsapp" onclick={() => openSocialShare("whatsapp")} disabled={!shareUrl || isShareLinkGenerating}>
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="logos:whatsapp-icon" class="h-6 w-6" />
                                    </span>
                                    <span class="text-[10px]">Whatsapp</span>
                            </button>
                                <button class="space-y-1 disabled:opacity-40" type="button" title="Share to Telegram" onclick={() => openSocialShare("telegram")} disabled={!shareUrl || isShareLinkGenerating}>
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="logos:telegram" class="h-6 w-6" />
                                    </span>
                                    <span class="text-[10px]">Telegram</span>
                                </button>
                                <button class="space-y-1 disabled:opacity-40" type="button" title="Share to LinkedIn" onclick={() => openSocialShare("linkedin")} disabled={!shareUrl || isShareLinkGenerating}>
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="logos:linkedin-icon" class="h-6 w-6" />
                                    </span>
                                    <span class="text-[10px]">Linkedin</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </details>
        </div>
    </section>

    {#if isContextModalOpen}
        <ContextSelectionModal
            bind:open={isContextModalOpen}
            contextPayload={contextModalPayloadDraft}
            onSave={onSaveGlobalContext}
        />
    {/if}
    
    <McpSelectionModal
        bind:open={isMcpConfigModalOpen}
        bind:mcpConfigurationDraft
        bind:mcpConfigurationError
    />
{/if}
