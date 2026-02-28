<script lang="ts">
    import Icon from "@iconify/svelte";
    import CodeMirror from "svelte-codemirror-editor";
    import { json } from "@codemirror/lang-json";
    import { UI } from "@ravenlens/frontend";
    import { avaiableModels, getProviderIconifyIcon } from "./config/models";
    import { selectedFile } from "./stores/files";
    import { selectedModel } from "./stores/selected";
    import { contextSpecification, saveContextSpecification } from "./stores/contextSpec";
    import { mcpConfigurationStore, saveMcpConfiguration } from "./stores/mcpConfig";
    import { alertState } from "./utils/alert";
    import type { ContextDeviceFile, ContextEditorFile, ContextNetworkURL, ContextSpecificationPayload, PlayMode } from "./editorComponents/types/AIList";

    type DropdownName = "model-settings" | "mcp-tools" | "play-settings" | "share";

    type McpServerConfig = {
        command: string;
        args: string[];
        env?: Record<string, string>;
    };

    type McpConfiguration = {
        mcpServers: Record<string, McpServerConfig>;
    };

    type McpValidationResult =
        | {
            valid: true;
            normalized: string;
            servers: string[];
        }
        | {
            valid: false;
            error: string;
        };

    const playModes: { label: string; value: PlayMode }[] = [
        { label: "Run non-runned", value: "run-non-runned" },
        { label: "Run all", value: "run-all" }
    ];

    const playModeIcons: Record<PlayMode, string> = {
        "run-non-runned": "material-symbols:play-arrow-outline-rounded",
        "run-all": "material-symbols:playlist-play-rounded"
    };

    const availableTools = ["Web search"] as const;
    const initialMcpConfigurationObject: McpConfiguration = {
        mcpServers: {
            github: {
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-github"]
            },
            filesystem: {
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-filesystem", "./"]
            },
            memory: {
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-memory"]
            },
            browser: {
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-browser"]
            }
        }
    };
    const initialMcpConfiguration = JSON.stringify(initialMcpConfigurationObject, null, 2);
    const initialModelKey = avaiableModels[0]?.model ?? "";

    let playMode = $state<PlayMode>("run-non-runned");
    let selectedModelKey = $state(initialModelKey);
    let modelWeights = $state<Record<string, number>>(
        initialModelKey ? { [initialModelKey]: 1 } : {}
    );
    let selectedTools = $state<string[]>(["File system"]);
    let useMcpServers = $state(true);
    let mcpConfiguration = $state($mcpConfigurationStore || initialMcpConfiguration);
    let selectedMcpServers = $state<string[]>([]);
    let mcpConfigurationDraft = $state(mcpConfiguration);
    let mcpConfigurationError = $state("");

    $effect(() => {
        try {
            const parsed = JSON.parse(mcpConfiguration);
            selectedMcpServers = Object.keys(parsed.mcpServers || {});
        } catch {
            selectedMcpServers = Object.keys(initialMcpConfigurationObject.mcpServers);
        }
    });

    let openDropdown = $state<DropdownName | undefined>(undefined);

    let desktopContextFiles = $state<ContextDeviceFile[]>([]);
    let editorContextFiles = $state<ContextEditorFile[]>([]);
    let networkContextUrls = $state<ContextNetworkURL[]>([]);
    let networkUrlDraft = $state("");

    let isContextModalOpen = $state(false);
    let isMcpConfigModalOpen = $state(false);
    const shareUrl = $derived(getShareUrl());

    const getModelByKey = (key: string) =>
        avaiableModels.find((model) => model.model === key);

    const currentModel = $derived(getModelByKey(selectedModelKey));

    const getCurrentModelWeight = () => modelWeights[selectedModelKey] ?? 1;

    function ensureModelWeight(key: string) {
        if (!key || modelWeights[key] !== undefined) {
            return;
        }

        modelWeights = {
            ...modelWeights,
            [key]: 1
        };
    }

    $effect(() => {
        $selectedModel = currentModel;
    });

    function onModelChange(ev: Event) {
        const target = ev.currentTarget as HTMLSelectElement | null;
        const modelNameFromTarget = target?.value;
        const modelNameFromDetail = (ev as CustomEvent<string | undefined>).detail;
        const nextModelKey = modelNameFromTarget ?? modelNameFromDetail ?? selectedModelKey;
        selectedModelKey = nextModelKey;
        ensureModelWeight(nextModelKey);
    }

    function toggleValue(state: string[], value: string) {
        if (state.includes(value)) {
            return state.filter((entry) => entry !== value);
        }
        return [...state, value];
    }

    function updateCurrentModelWeight(weight: number) {
        modelWeights = {
            ...modelWeights,
            [selectedModelKey]: weight
        };
    }

    function parseContextSpecification(rawValue: string): ContextSpecificationPayload {
        if (!rawValue) {
            return {
                desktopFiles: [],
                editorFiles: [],
                networkUrls: []
            };
        }

        try {
            const parsed = JSON.parse(rawValue) as Partial<ContextSpecificationPayload>;

            return {
                desktopFiles: Array.isArray(parsed.desktopFiles) ? parsed.desktopFiles : [],
                editorFiles: Array.isArray(parsed.editorFiles) ? parsed.editorFiles : [],
                networkUrls: Array.isArray(parsed.networkUrls) ? parsed.networkUrls : []
            };
        } catch {
            return {
                desktopFiles: [],
                editorFiles: [],
                networkUrls: []
            };
        }
    }

    async function fileToDataUrl(file: globalThis.File) {
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(file);
        });
    }

    async function onDesktopFilesChange(event: Event) {
        const target = event.currentTarget as HTMLInputElement;
        const fileList = Array.from(target.files ?? []);
        if (!fileList.length) {
            return;
        }

        const locationHint = target.value || "Desktop";

        const filesToAdd = await Promise.all(
            fileList.map(async (file) => {
                const isImage = file.type.startsWith("image/");

                return {
                    id: `${file.name}-${file.lastModified}-${file.size}`,
                    name: file.name,
                    type: file.type || "application/octet-stream",
                    size: file.size,
                    locationHint,
                    previewDataUrl: isImage ? await fileToDataUrl(file) : undefined
                } satisfies ContextDeviceFile;
            })
        );

        desktopContextFiles = [...desktopContextFiles, ...filesToAdd].filter(
            (entry, index, list) => list.findIndex((check) => check.id === entry.id) === index
        );

        target.value = "";
    }

    function removeDesktopContextFile(id: string) {
        desktopContextFiles = desktopContextFiles.filter((entry) => entry.id !== id);
    }

    function addSelectedEditorFile() {
        if (!$selectedFile) {
            return;
        }

        const nextFile: ContextEditorFile = {
            id: $selectedFile.id,
            name: $selectedFile.name
        };

        if (editorContextFiles.some((entry) => entry.id === nextFile.id)) {
            return;
        }

        editorContextFiles = [...editorContextFiles, nextFile];
    }

    function removeEditorContextFile(id: string) {
        editorContextFiles = editorContextFiles.filter((entry) => entry.id !== id);
    }

    function normalizeNetworkUrl(rawUrl: string) {
        const maybeWithProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
        const parsed = new URL(maybeWithProtocol);
        return parsed.toString();
    }

    function getFaviconUrl(targetUrl: string) {
        const host = new URL(targetUrl).hostname;
        return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
    }

    function addNetworkUrl() {
        const rawDraft = networkUrlDraft.trim();
        if (!rawDraft) {
            return;
        }

        try {
            const normalizedUrl = normalizeNetworkUrl(rawDraft);

            if (networkContextUrls.some((entry) => entry.url === normalizedUrl)) {
                networkUrlDraft = "";
                return;
            }

            networkContextUrls = [
                ...networkContextUrls,
                {
                    id: `${normalizedUrl}-${Date.now()}`,
                    url: normalizedUrl,
                    favicon: getFaviconUrl(normalizedUrl)
                }
            ];
            networkUrlDraft = "";
        } catch {
            console.warn("Invalid network url", rawDraft);
        }
    }

    function removeNetworkUrl(id: string) {
        networkContextUrls = networkContextUrls.filter((entry) => entry.id !== id);
    }

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

    function openContextModal() {
        const parsed = parseContextSpecification($contextSpecification);
        desktopContextFiles = parsed.desktopFiles;
        editorContextFiles = parsed.editorFiles;
        networkContextUrls = parsed.networkUrls;
        isContextModalOpen = true;
    }

    function closeContextModal() {
        isContextModalOpen = false;
    }

    function onSaveContext() {
        const payload: ContextSpecificationPayload = {
            desktopFiles: desktopContextFiles,
            editorFiles: editorContextFiles,
            networkUrls: networkContextUrls
        };

        saveContextSpecification(JSON.stringify(payload));
        isContextModalOpen = false;
    }

    function getShareUrl() {
        if (typeof window === "undefined") {
            return "";
        }

        const url = new URL(window.location.href);

        if ($selectedFile?.id) {
            url.searchParams.set("sharedFile", $selectedFile.id);
        }

        return url.toString();
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

    function validateMcpConfiguration(rawConfiguration: string): McpValidationResult {
        try {
            const parsed = JSON.parse(rawConfiguration) as Partial<McpConfiguration>;

            if (!parsed || typeof parsed !== "object") {
                return { valid: false, error: "Configuration must be a JSON object." };
            }

            if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
                return { valid: false, error: 'Configuration must contain a "mcpServers" object.' };
            }

            const serverEntries = Object.entries(parsed.mcpServers);

            for (const [serverName, serverConfig] of serverEntries) {
                if (!serverConfig || typeof serverConfig !== "object") {
                    return { valid: false, error: `Server "${serverName}" must be an object.` };
                }

                if (typeof (serverConfig as McpServerConfig).command !== "string" ||
                    !(serverConfig as McpServerConfig).command.trim()) {
                    return { valid: false, error: `Server "${serverName}" must include a non-empty "command" string.` };
                }

                const args = (serverConfig as McpServerConfig).args;
                if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
                    return { valid: false, error: `Server "${serverName}" must include an "args" array of strings.` };
                }

                if ((serverConfig as McpServerConfig).env !== undefined) {
                    const envValue = (serverConfig as McpServerConfig).env;
                    const isRecord = !!envValue && typeof envValue === "object" && !Array.isArray(envValue);
                    if (!isRecord || Object.values(envValue as Record<string, unknown>).some((value) => typeof value !== "string")) {
                        return { valid: false, error: `Server "${serverName}" has invalid "env". It must be an object of string values.` };
                    }
                }
            }

            return {
                valid: true,
                normalized: JSON.stringify(parsed, null, 2),
                servers: serverEntries.map(([serverName]) => serverName)
            };
        } catch {
            return { valid: false, error: "Invalid JSON format. Please fix syntax errors before accepting." };
        }
    }

    function openMcpConfigurationEditor() {
        mcpConfigurationDraft = mcpConfiguration;
        mcpConfigurationError = "";
        isMcpConfigModalOpen = true;
        openDropdown = undefined;
    }

    function closeMcpConfigurationEditor() {
        isMcpConfigModalOpen = false;
        mcpConfigurationError = "";
    }

    function acceptMcpConfiguration() {
        const validation = validateMcpConfiguration(mcpConfigurationDraft);
        if (!validation.valid) {
            mcpConfigurationError = validation.error;
            return;
        }

        mcpConfiguration = validation.normalized;
        saveMcpConfiguration(mcpConfiguration);
        selectedMcpServers = validation.servers;
        mcpConfigurationError = "";
        isMcpConfigModalOpen = false;
    }

    function onPlay() {
        console.log("Running play mode", {
            mode: playMode,
            model: $selectedModel,
            tools: selectedTools,
            mcpServers: useMcpServers ? selectedMcpServers : [],
            contextSpec: $contextSpecification
        });
    }
</script>

<svelte:window onclick={onWindowClick} />

{#if $selectedFile}

    <section
        id="upperstripe"
        class="border-b border-base-300 bg-base-100 flex items-center justify-between px-4 py-2 transition-colors"
    >
        <div class="right-side flex items-center gap-2">
            
        </div>

        <div 
            class="left-side flex gap-7 items-center"
        >
            <div class="flex items-center gap-2">
                <div class="join">
                    <UI.Common.AI.SelectAIModel
                        selectedModel={selectedModelKey}
                        avaiabaleModels={avaiableModels}
                        placeholder="Select model"
                        onChange={onModelChange}
                        selectSize="sm"
                    />

                    <details
                        class="dropdown dropdown-end join-item"
                        open={openDropdown === "model-settings"}
                        ontoggle={(event) => onDropdownToggle("model-settings", event)}
                    >
                        <summary class="btn btn-sm h-full rounded-l-none bg-primary/95 text-white/70 border-primary px-1" aria-label="Model Settings" title="Model settings">
                            <Icon icon="material-symbols:settings-outline-rounded" class="w-3 h-3" />
                        </summary>

                        <div class="dropdown-content p-3 shadow bg-base-200 rounded-box z-[20] w-80 space-y-2">
                            <div class="flex items-center justify-between text-sm">
                                <div class="flex items-center gap-2">
                                    {#if $selectedModel}
                                        <Icon icon={getProviderIconifyIcon($selectedModel.provider)} class="w-4 h-4" />
                                    {/if}
                                    <span>{$selectedModel?.model ?? "Select model"}</span>
                                </div>
                                <span class="badge badge-outline">Weight: {getCurrentModelWeight().toFixed(2)}</span>
                            </div>

                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={getCurrentModelWeight()}
                                class="range range-primary"
                                oninput={(event) =>
                                    updateCurrentModelWeight(Number((event.currentTarget as HTMLInputElement).value))}
                            />
                        </div>
                    </details>
                </div>

                <details
                    class="dropdown dropdown-end"
                    open={openDropdown === "mcp-tools"}
                    ontoggle={(event) => onDropdownToggle("mcp-tools", event)}
                >
                    <summary class="btn btn-sm btn-ghost" title="MCP & tools" aria-label="MCP & tools">
                        <Icon icon="material-symbols:build-outline-rounded" class="w-5 h-5" />
                    </summary>
                    <div class="dropdown-content p-3 shadow bg-base-200 rounded-box z-[20] w-80 space-y-3">
                        <div>
                            <p class="text-xs uppercase tracking-wide opacity-70 mb-1">Tools</p>
                            <div class="space-y-1">
                                {#each availableTools as tool (tool)}
                                    <label class="label cursor-pointer justify-start gap-2">
                                        <input
                                            type="checkbox"
                                            class="checkbox checkbox-primary checkbox-sm"
                                            checked={selectedTools.includes(tool)}
                                            onchange={() => (selectedTools = toggleValue(selectedTools, tool))}
                                        />
                                        <span class="label-text">{tool}</span>
                                    </label>
                                {/each}
                            </div>
                        </div>

                        <div>
                            <p class="text-xs uppercase tracking-wide opacity-70 mb-1">MCP servers access</p>
                            <label class="label cursor-pointer justify-between mb-1 px-0">
                                <span class="label-text text-xs">Use MCP servers for tasks</span>
                                <input type="checkbox" class="toggle toggle-primary toggle-sm" bind:checked={useMcpServers} />
                            </label>
                            <div class="rounded border border-base-300 bg-base-100 overflow-auto max-h-48">
                                <CodeMirror
                                    value={mcpConfiguration}
                                    lang={json()}
                                    readonly={true}
                                    editable={false}
                                    lineNumbers={true}
                                    lineWrapping={false}
                                    styles={{
                                        "&": {
                                            minWidth: "36rem",
                                            height: "12rem"
                                        }
                                    }}
                                />
                            </div>
                            <div class="mt-2 flex items-center justify-between">
                                <span class="text-xs opacity-70">
                                    {useMcpServers
                                        ? `${selectedMcpServers.length} server(s) configured`
                                        : "MCP servers disabled for tasks"}
                                </span>
                                <button class="btn btn-xs btn-primary" onclick={openMcpConfigurationEditor}>Edit</button>
                            </div>
                        </div>
                    </div>
                </details>

                <button class="btn btn-sm btn-ghost" onclick={openContextModal} title="Context specification" aria-label="Context specification">
                    <Icon icon="material-symbols:note-stack-outline-rounded" class="w-5 h-5" />
                </button>

                <div class="join">
                    <button class="btn btn-sm jolgin-item btn-primary" onclick={onPlay}>
                        <Icon icon="material-symbols:play-circle-outline-rounded" class="w-5 h-5" />
                        <span>Play</span>
                    </button>

                    <details
                        class="dropdown dropdown-end join-item"
                        open={openDropdown === "play-settings"}
                        ontoggle={(event) => onDropdownToggle("play-settings", event)}
                    >
                        <summary class="btn btn-sm rounded-l-none bg-primary/95 text-white/70 shadow-xl border-primary px-1" aria-label="Play settings" title="Play settings">
                            <Icon icon="material-symbols:settings-outline-rounded" class="w-3 h-3" />
                        </summary>

                        <div class="dropdown-content p-3 shadow bg-base-200 rounded-box z-[20] w-64 space-y-2">
                            <p class="text-xs uppercase tracking-wide opacity-70">Mode</p>
                            {#each playModes as mode (mode.value)}
                                <button
                                    type="button"
                                    class="btn btn-sm justify-start w-full"
                                    class:btn-primary={playMode === mode.value}
                                    class:btn-ghost={playMode !== mode.value}
                                    onclick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        playMode = mode.value;
                                    }}
                                >
                                    <Icon
                                        icon={playMode === mode.value
                                            ? "material-symbols:check-box-rounded"
                                            : "material-symbols:check-box-outline-blank-rounded"}
                                        class="w-4 h-4"
                                    />
                                    <Icon icon={playModeIcons[mode.value]} class="w-4 h-4" />
                                    <span>{mode.label}</span>
                                </button>
                            {/each}
                        </div>
                    </details>
                </div>
            </div>
        
            <details
                class="dropdown dropdown-end"
                open={openDropdown === "share"}
                ontoggle={(event) => onDropdownToggle("share", event)}
            >
                <summary class="btn btn-sm theme-dark:bg-sky-700 bg-sky-400 font-bold text-white">
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
                            <div class="flex h-10 items-center rounded-xl bg-base-200 pl-3 pr-1">
                                <input
                                    class="h-full w-full bg-transparent text-xs outline-none border-none shadow-none active:outline-none focus:border-none"
                                    readonly
                                    value={shareUrl}
                                />
                                <button class="btn btn-ghost btn-circle btn-xs" onclick={copyShareUrl} aria-label="Copy share URL" title="Copy share URL">
                                    <Icon icon="material-symbols:content-copy-outline-rounded" class="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div class="mt-5 space-y-2">
                            <p class="text-base font-semibold">Share to</p>
                            <div class="grid grid-cols-5 gap-1 text-center">
                                <button class="space-y-1" type="button" title="Share to Facebook" onclick={() => openSocialShare("facebook")}>
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="logos:facebook" class="h-6 w-6" />
                                    </span>
                                    <span class="text-[10px]">Facebook</span>
                                </button>
                                <button class="space-y-1" type="button" title="Share to X" onclick={() => openSocialShare("x")}>
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="simple-icons:x" class="h-4 w-4" />
                                    </span>
                                    <span class="text-[10px]">X</span>
                                </button>
                                <button class="space-y-1" type="button" title="Share to Whatsapp" onclick={() => openSocialShare("whatsapp")}>
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="logos:whatsapp-icon" class="h-6 w-6" />
                                    </span>
                                    <span class="text-[10px]">Whatsapp</span>
                                </button>
                                <button class="space-y-1" type="button" title="Share to Telegram" onclick={() => openSocialShare("telegram")}>
                                    <span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-200">
                                        <Icon icon="logos:telegram" class="h-6 w-6" />
                                    </span>
                                    <span class="text-[10px]">Telegram</span>
                                </button>
                                <button class="space-y-1" type="button" title="Share to LinkedIn" onclick={() => openSocialShare("linkedin")}>
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
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="fixed inset-0 z-[60] bg-black/40" onclick={closeContextModal}>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="flex min-h-full items-center justify-center p-4" onclick={(event) => event.stopPropagation()}>
                <UI.Modals.ModalWrapper
                    name="Context specification"
                    open={isContextModalOpen}
                    closeOnBackdrop={true}
                    size="md"
                    on:close={closeContextModal}
                >
                    <UI.Modals.ModalWrapperHeading headingName="Context specification" on:close={closeContextModal} />

                    <div class="pt-2 space-y-3">
                        <div class="space-y-2">
                            <div class="flex items-center justify-between">
                                <p class="text-xs uppercase tracking-wide opacity-70">Desktop files</p>
                                <label class="btn btn-xs btn-ghost" title="Add files from desktop">
                                    <Icon icon="material-symbols:upload-file-outline-rounded" class="w-4 h-4" />
                                    <span>Add files</span>
                                    <input
                                        type="file"
                                        multiple
                                        class="hidden"
                                        onchange={onDesktopFilesChange}
                                    />
                                </label>
                            </div>

                            <div class="space-y-1 max-h-28 overflow-auto">
                                {#if desktopContextFiles.length === 0}
                                    <p class="text-xs opacity-60">No desktop files selected.</p>
                                {/if}

                                {#each desktopContextFiles as file (file.id)}
                                    <div class="flex items-center justify-between rounded border border-base-300 px-2 py-1" title={file.locationHint}>
                                        <div class="flex items-center gap-2 min-w-0">
                                            {#if file.previewDataUrl}
                                                <img src={file.previewDataUrl} alt={file.name} class="w-8 h-8 rounded object-cover" />
                                            {:else}
                                                <Icon icon="material-symbols:description-outline-rounded" class="w-5 h-5 opacity-70" />
                                            {/if}
                                            <span class="text-xs truncate">{file.name}</span>
                                        </div>
                                        <button class="btn btn-ghost btn-xs" title="Remove file" onclick={() => removeDesktopContextFile(file.id)}>
                                            <Icon icon="material-symbols:close-rounded" class="w-4 h-4" />
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        </div>

                        <div class="space-y-2">
                            <div class="flex items-center justify-between">
                                <p class="text-xs uppercase tracking-wide opacity-70">Editor files</p>
                                <button
                                    class="btn btn-xs btn-ghost"
                                    onclick={addSelectedEditorFile}
                                    disabled={!$selectedFile}
                                    title="Add currently selected editor file"
                                >
                                    <Icon icon="material-symbols:add-rounded" class="w-4 h-4" />
                                    <span>Add selected</span>
                                </button>
                            </div>

                            <div class="space-y-1 max-h-24 overflow-auto">
                                {#if editorContextFiles.length === 0}
                                    <p class="text-xs opacity-60">No editor files selected.</p>
                                {/if}

                                {#each editorContextFiles as file (file.id)}
                                    <div class="flex items-center justify-between rounded border border-base-300 px-2 py-1">
                                        <div class="flex items-center gap-2 min-w-0">
                                            <Icon icon="material-symbols:article-outline-rounded" class="w-5 h-5 opacity-70" />
                                            <span class="text-xs truncate">{file.name}</span>
                                        </div>

                                        <button class="btn btn-ghost btn-xs" title="Remove editor file" onclick={() => removeEditorContextFile(file.id)}>
                                            <Icon icon="material-symbols:close-rounded" class="w-4 h-4" />
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        </div>

                        <div class="space-y-2">
                            <p class="text-xs uppercase tracking-wide opacity-70">Network URLs</p>

                            <div class="join w-full">
                                <input
                                    class="input input-sm input-bordered join-item w-full"
                                    placeholder="https://youtube.com/..."
                                    bind:value={networkUrlDraft}
                                />
                                <button class="btn btn-sm join-item" onclick={addNetworkUrl} title="Add URL">
                                    <Icon icon="material-symbols:add-link-rounded" class="w-4 h-4" />
                                </button>
                            </div>

                            <div class="space-y-1 max-h-24 overflow-auto">
                                {#if networkContextUrls.length === 0}
                                    <p class="text-xs opacity-60">No URLs added.</p>
                                {/if}

                                {#each networkContextUrls as entry (entry.id)}
                                    <div class="flex items-center justify-between rounded border border-base-300 px-2 py-1">
                                        <div class="flex items-center gap-2 min-w-0">
                                            <img src={entry.favicon} alt="website favicon" class="w-4 h-4" />
                                            <span class="text-xs truncate">{entry.url}</span>
                                        </div>

                                        <button class="btn btn-ghost btn-xs" title="Remove URL" onclick={() => removeNetworkUrl(entry.id)}>
                                            <Icon icon="material-symbols:close-rounded" class="w-4 h-4" />
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    </div>

                    <div class="mt-4 flex justify-end gap-2">
                        <button class="btn btn-ghost" onclick={closeContextModal}>Cancel</button>
                        <button class="btn btn-primary" onclick={onSaveContext}>Save context</button>
                    </div>
                </UI.Modals.ModalWrapper>
            </div>
        </div>
    {/if}

    {#if isMcpConfigModalOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="fixed inset-0 z-[60] bg-black/40" onclick={closeMcpConfigurationEditor}>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="flex min-h-full items-center justify-center p-4" onclick={(event) => event.stopPropagation()}>
                <UI.Modals.ModalWrapper
                    name="MCP configuration"
                    open={isMcpConfigModalOpen}
                    closeOnBackdrop={true}
                    size="lg"
                    on:close={closeMcpConfigurationEditor}
                >
                    <UI.Modals.ModalWrapperHeading
                        headingName="MCP servers configuration"
                        on:close={closeMcpConfigurationEditor}
                    />

                    <div class="pt-2 space-y-2">
                        {#if mcpConfigurationError}
                            <p class="text-sm text-error font-medium">{mcpConfigurationError}</p>
                        {/if}

                        <div class="rounded border border-base-300 bg-base-100 overflow-auto max-h-[60vh]">
                            <CodeMirror
                                bind:value={mcpConfigurationDraft}
                                lang={json()}
                                lineNumbers={true}
                                lineWrapping={false}
                                styles={{
                                    "&": {
                                        minWidth: "48rem",
                                        height: "50vh"
                                    }
                                }}
                            />
                        </div>
                    </div>

                    <div class="mt-4 flex justify-end gap-2">
                        <button class="btn btn-ghost" onclick={closeMcpConfigurationEditor}>Cancel</button>
                        <button class="btn btn-primary" onclick={acceptMcpConfiguration}>Accept</button>
                    </div>
                </UI.Modals.ModalWrapper>
            </div>
        </div>
    {/if}
{/if}
    