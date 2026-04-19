<script lang="ts">
    import Icon from "@iconify/svelte";
    import { UI } from "@ravenlens/frontend";
    import AIAnswerRichContent from "../../editorComponents/ui/mod/AIAnswerRichContent.svelte";
    import { getPlayModeLabel } from "$lib/editorComponents/types/AIList";
    import { selectedFile } from "$lib/stores/files";
    import { hoveredListItemId } from "$lib/stores/hoveredListItem";
    import { editorAIChat, SelectedAnswerFromChatContext, selectedChatAnswerIds } from "$lib/stores/aiRightSideChat"
    import { File } from "@ravenlens/shared";
    import { isSharedRoute } from "$lib/stores/share";
    import { canManageWorkspaceFiles, workspaceHasActiveSubscription, workspaceSubscriptionCheckInProgress } from "$lib/stores/subscription";

    let {
        aiAnswers,
        itemId = "",
        isReadOnly = false
    }: {
        aiAnswers: File.FileAI.AIPoint["aiAnswers"];
        itemId?: string;
        isReadOnly?: boolean;
    } = $props();

    let normalizedAiAnswers = $derived(aiAnswers ?? []);

    let openAnswerIndices = $state<number[]>([]);
    let isAnswersListOpen = $state(true);
    let zoomedIndex = $state<number | null>(null);
    let infoIndex = $state<number | null>(null);
    let removeAnswerIndex = $state<number | null>(null);
    let answerContextMenu = $state<{ x: number; y: number; answer: File.FileAI.AIAnswer } | null>(null);
    let selectedContextSequence = 0;

    let periodicalSelectedAnswerIds: string[] = $state([]);
    SelectedAnswerFromChatContext.listen(answerId => {
        // Set item as selected
        periodicalSelectedAnswerIds.push(answerId);
        periodicalSelectedAnswerIds = periodicalSelectedAnswerIds;

        // Set removal timeout
        setTimeout(() => {
            const indexFirst = periodicalSelectedAnswerIds.findIndex(paId => paId === answerId);

            if (indexFirst > -1) {
                periodicalSelectedAnswerIds.splice(indexFirst, 1);
                periodicalSelectedAnswerIds = periodicalSelectedAnswerIds;
            }    
        }, 5_000);
    });

    function toggleAnswersList() {
        isAnswersListOpen = !isAnswersListOpen;
    }

    function isExpanded(index: number) {
        return openAnswerIndices.includes(index);
    }

    function toggleAnswer(index: number) {
        if (openAnswerIndices.includes(index)) {
            openAnswerIndices = openAnswerIndices.filter((value) => value !== index);
            return;
        }

        openAnswerIndices = [...openAnswerIndices, index];
    }

    function openZoom(index: number) {
        zoomedIndex = index;
    }

    function closeZoom() {
        zoomedIndex = null;
    }

    function openInfo(index: number) {
        infoIndex = index;
    }

    function closeInfo() {
        infoIndex = null;
    }

    function openRemoveAnswer(index: number) {
        if (isReadOnly) {
            return;
        }

        removeAnswerIndex = index;
    }

    function closeRemoveAnswer() {
        removeAnswerIndex = null;
    }

    function shiftIndexAfterRemoval(currentIndex: number | null, removedIndex: number) {
        if (currentIndex === null) {
            return null;
        }

        if (currentIndex === removedIndex) {
            return null;
        }

        if (currentIndex > removedIndex) {
            return currentIndex - 1;
        }

        return currentIndex;
    }

    function removeAnswerFromItem() {
        if (isReadOnly) {
            closeRemoveAnswer();
            return;
        }

        if (!itemId || removeAnswerIndex === null) {
            closeRemoveAnswer();
            return;
        }

        const removedIndex = removeAnswerIndex;

        selectedFile.update((file) => {
            if (!file) {
                return file;
            }

            let hasUpdatedItem = false;
            const updatedLists = file.lists.map((list) => {
                let hasUpdatedList = false;
                const updatedItems = list.items.map((item) => {
                    if (item.id !== itemId) {
                        return item;
                    }

                    const answers = item.answers ?? [];
                    if (removedIndex < 0 || removedIndex >= answers.length) {
                        return item;
                    }

                    const nextAnswers = answers.filter((_, index) => index !== removedIndex);
                    hasUpdatedList = true;

                    return {
                        ...item,
                        answers: nextAnswers.length > 0 ? nextAnswers : undefined
                    };
                });

                if (!hasUpdatedList) {
                    return list;
                }

                hasUpdatedItem = true;
                return {
                    ...list,
                    items: updatedItems
                };
            });

            if (!hasUpdatedItem) {
                return file;
            }

            return {
                ...file,
                lists: updatedLists
            };
        });

        openAnswerIndices = openAnswerIndices
            .filter((index) => index !== removedIndex)
            .map((index) => (index > removedIndex ? index - 1 : index));

        zoomedIndex = shiftIndexAfterRemoval(zoomedIndex, removedIndex);
        infoIndex = shiftIndexAfterRemoval(infoIndex, removedIndex);
        closeRemoveAnswer();
    }

    function formatDate(timestamp: number) {
        const d = new Date(timestamp);
        const pad = (n: number) => String(n).padStart(2, '0');
        const day = pad(d.getDate());
        const month = pad(d.getMonth() + 1);
        const year = d.getFullYear();
        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        return `${day}.${month}.${year}, ${hours}:${minutes}`;
    }

    function escapeHtml(text: string): string {
        return text
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function getProviderName(provider: unknown) {
        if (typeof provider === 'string') {
            return provider;
        }

        if (
            provider &&
            typeof provider === 'object' &&
            'provider' in provider &&
            typeof (provider as { provider?: unknown }).provider === 'string'
        ) {
            return (provider as { provider: string }).provider;
        }

        return '';
    }

    function getProviderIcon(provider: unknown) {
        switch (getProviderName(provider).toLowerCase()) {
            case 'openai':
                return 'simple-icons:openai';
            case 'anthropic':
                return 'simple-icons:anthropic';
            case 'google':
            case 'googleai':
                return 'simple-icons:google';
            case 'mistral':
            case 'mistralai':
                return 'simple-icons:mistral';
            case 'meta':
                return 'simple-icons:meta';
            case 'xai':
                return 'simple-icons:x';
            case 'perplexity':
                return 'simple-icons:perplexity';
            case 'deepseek':
                return 'simple-icons:deepseek';
            case 'groq':
                return 'simple-icons:groq';
            case 'ollama':
                return 'simple-icons:ollama';
            default:
                return 'simple-icons:icloud';
        }
    }

    const EMPTY_CONTEXT_PAYLOAD: File.FileAI.ContextSpecificationPayload = {
        desktopFiles: [],
        editorFiles: [],
        networkUrls: []
    };

    function isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null;
    }

    function uniqueStrings(values: string[]) {
        const seen: Record<string, true> = {};
        const output: string[] = [];

        for (const value of values) {
            const trimmed = value.trim();
            if (!trimmed) {
                continue;
            }

            const normalized = trimmed.toLowerCase();
            if (normalized === 'false') {
                continue;
            }

            if (seen[normalized]) {
                continue;
            }

            seen[normalized] = true;
            output.push(trimmed);
        }

        return output;
    }

    function splitCommaSeparated(raw: string) {
        return raw
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value.length > 0);
    }

    function parseStringList(value: unknown): string[] {
        if (typeof value === 'string') {
            return uniqueStrings(splitCommaSeparated(value));
        }

        if (Array.isArray(value)) {
            const flattenedValues = value.flatMap((entry) => {
                if (typeof entry === 'string') {
                    return splitCommaSeparated(entry);
                }

                return [];
            });

            return uniqueStrings(flattenedValues);
        }

        return [];
    }

    function getFaviconUrl(targetUrl: string) {
        try {
            const host = new URL(targetUrl).hostname;
            if (!host) {
                return '';
            }

            return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
        } catch {
            return '';
        }
    }

    function formatToolName(rawName: string) {
        const normalizedName = rawName.trim();
        if (!normalizedName) {
            return '';
        }

        const lookupKey = normalizedName
            .toLowerCase()
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        switch (lookupKey) {
            case 'web search':
            case 'websearch':
                return 'Web search';
            case 'current document':
            case 'currentdocument':
                return 'Current Document';
            case 'ravenone documents':
            case 'ravenonedocuments':
                return 'RavenOne Documents';
            default: {
                const withSpaces = normalizedName
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/[_-]+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
            }
        }
    }

    function normalizeContextPayload(context: unknown): File.FileAI.ContextSpecificationPayload {
        if (!isRecord(context)) {
            return {
                desktopFiles: [],
                editorFiles: [],
                networkUrls: []
            };
        }

        const desktopFilesRaw = Array.isArray(context['desktopFiles']) ? context['desktopFiles'] : [];
        const editorFilesRaw = Array.isArray(context['editorFiles']) ? context['editorFiles'] : [];
        const networkUrlsRaw = Array.isArray(context['networkUrls']) ? context['networkUrls'] : [];

        const desktopFiles = desktopFilesRaw
            .map((entry, index): File.FileAI.ContextDeviceFile | null => {
                if (!isRecord(entry)) {
                    return null;
                }

                const name = typeof entry['name'] === 'string' && entry['name'].trim().length > 0
                    ? entry['name'].trim()
                    : 'Unknown file';

                return {
                    id:
                        typeof entry['id'] === 'string' && entry['id'].trim().length > 0
                            ? entry['id'].trim()
                            : `${name}-${index}`,
                    name,
                    type:
                        typeof entry['type'] === 'string' && entry['type'].trim().length > 0
                            ? entry['type'].trim()
                            : 'application/octet-stream',
                    size: typeof entry['size'] === 'number' ? entry['size'] : 0,
                    locationHint:
                        typeof entry['locationHint'] === 'string' && entry['locationHint'].trim().length > 0
                            ? entry['locationHint'].trim()
                            : 'Desktop',
                    previewDataUrl:
                        typeof entry['previewDataUrl'] === 'string' && entry['previewDataUrl'].trim().length > 0
                            ? entry['previewDataUrl'].trim()
                            : undefined
                };
            })
            .filter((entry): entry is File.FileAI.ContextDeviceFile => entry !== null);

        const editorFiles = editorFilesRaw
            .map((entry, index): File.FileAI.ContextEditorFile | null => {
                if (!isRecord(entry)) {
                    return null;
                }

                const name = typeof entry['name'] === 'string' && entry['name'].trim().length > 0
                    ? entry['name'].trim()
                    : 'Unknown file';

                return {
                    id:
                        typeof entry['id'] === 'string' && entry['id'].trim().length > 0
                            ? entry['id'].trim()
                            : `${name}-${index}`,
                    name
                };
            })
            .filter((entry): entry is File.FileAI.ContextEditorFile => entry !== null);

        const networkUrls = networkUrlsRaw
            .map((entry, index): File.FileAI.ContextNetworkURL | null => {
                if (!isRecord(entry)) {
                    return null;
                }

                const url = typeof entry['url'] === 'string' ? entry['url'].trim() : '';
                if (!url) {
                    return null;
                }

                return {
                    id:
                        typeof entry['id'] === 'string' && entry['id'].trim().length > 0
                            ? entry['id'].trim()
                            : `${url}-${index}`,
                    url,
                    favicon:
                        typeof entry['favicon'] === 'string' && entry['favicon'].trim().length > 0
                            ? entry['favicon'].trim()
                            : getFaviconUrl(url)
                };
            })
            .filter((entry): entry is File.FileAI.ContextNetworkURL => entry !== null);

        return {
            desktopFiles,
            editorFiles,
            networkUrls
        };
    }

    function parseMcpServerNames(mcp: unknown): string[] {
        if (mcp === false || mcp === null || mcp === undefined) {
            return [];
        }

        const directNames = parseStringList(mcp);
        if (directNames.length > 0) {
            return directNames;
        }

        if (!isRecord(mcp)) {
            return [];
        }

        const nestedMcpServers = mcp['mcpServers'];
        const nestedNames = parseStringList(nestedMcpServers);
        if (nestedNames.length > 0) {
            return nestedNames;
        }

        if (isRecord(nestedMcpServers)) {
            return uniqueStrings(Object.keys(nestedMcpServers));
        }

        return uniqueStrings(Object.keys(mcp));
    }

    function parseToolNames(tools: unknown): string[] {
        const directTools = parseStringList(tools).map(formatToolName);
        if (directTools.length > 0) {
            return uniqueStrings(directTools);
        }

        if (!isRecord(tools)) {
            return [];
        }

        const parsedTools: string[] = [];

        for (const [key, value] of Object.entries(tools)) {
            if (typeof value === 'boolean') {
                if (value) {
                    parsedTools.push(formatToolName(key));
                }

                continue;
            }

            if (typeof value === 'string') {
                const normalizedValue = value.trim().toLowerCase();
                if (normalizedValue === 'true') {
                    parsedTools.push(formatToolName(key));
                    continue;
                }

                if (normalizedValue && normalizedValue !== 'false') {
                    parsedTools.push(...splitCommaSeparated(value).map(formatToolName));
                }

                continue;
            }

            if (Array.isArray(value)) {
                parsedTools.push(...parseStringList(value).map(formatToolName));
            }
        }

        return uniqueStrings(parsedTools);
    }

    const zoomedAnswer = $derived(zoomedIndex === null ? null : normalizedAiAnswers[zoomedIndex] ?? null);
    const infoAnswer = $derived(infoIndex === null ? null : normalizedAiAnswers[infoIndex] ?? null);
    const removeAnswer = $derived(removeAnswerIndex === null ? null : normalizedAiAnswers[removeAnswerIndex] ?? null);
    const infoContextPayload = $derived(infoAnswer ? normalizeContextPayload(infoAnswer.context) : EMPTY_CONTEXT_PAYLOAD);
    const infoMcpServers = $derived(infoAnswer ? parseMcpServerNames(infoAnswer.mcp) : []);
    const infoTools = $derived(infoAnswer ? parseToolNames(infoAnswer.tools) : []);
    const hasInfoContextResources = $derived(
        infoContextPayload.desktopFiles.length > 0 ||
            infoContextPayload.editorFiles.length > 0 ||
            infoContextPayload.networkUrls.length > 0
    );

    function onMouseEnter(ev: Event) {
        ev.stopPropagation();
        ev.preventDefault();
        
        hoveredListItemId.set(null);
    }

    function onMouseLeave() {
        hoveredListItemId.set(null);
    }

    function closeAnswerContextMenu() {
        answerContextMenu = null;
    }

    function onContextMenuChatAnswer(answer: File.FileAI.AIAnswer) {
        return (event: MouseEvent) => {
            const answersRoot = (event.currentTarget as HTMLElement | null)?.closest('[data-ai-answers-root="true"]') as HTMLElement | null;
            if (!answersRoot) {
                closeAnswerContextMenu();
                return;
            }
    
            event.preventDefault();
            event.stopPropagation();
    
            answerContextMenu = {
                x: event.clientX,
                y: event.clientY,
                answer: answer
            };
        }
    }

    function createSelectedTextContextRange(selectedText: string) {
        const selectionBase = Date.now() + selectedContextSequence;
        selectedContextSequence += 1;

        const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `selection-${selectionBase}-${Math.random().toString(16).slice(2)}`;

        return {
            id,
            from: selectionBase,
            to: selectionBase + Math.max(1, selectedText.length),
            html: escapeHtml(selectedText).replaceAll('\n', '<br />')
        };
    }

    function onAddSelectionToAiChatContext() {
        const currentSelection = answerContextMenu;
        if (!currentSelection) {
            return;
        }

        selectedChatAnswerIds.selectAnswer(
            $selectedFile?.id!,
            answerContextMenu?.answer!
        );

        closeAnswerContextMenu();
    }

    function onRemoveFromContext() {
        selectedChatAnswerIds.removeCurrentFileAnswerId(answerContextMenu?.answer.id!);
        closeAnswerContextMenu();
    }

    function onWindowClick(event: MouseEvent) {
        if (!answerContextMenu) {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (target?.closest('.ai-answer-context-menu')) {
            return;
        }

        closeAnswerContextMenu();
    }

    function onWindowKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            closeAnswerContextMenu();
        }
    }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section 
    class="space-y-2 px-10 pt-5"
    data-ai-answers-root="true"
    data-list-item-id={itemId}
    contenteditable="false"
    onmouseenter={onMouseEnter}
    onmouseleave={onMouseLeave}
>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
        class="flex w-full items-center justify-between text-left"
        onclick={toggleAnswersList}
        aria-expanded={isAnswersListOpen}
    >
        <span class="text-sm font-semibold opacity-90">
            AI Answers
            <span class="ml-1 text-xs font-normal opacity-70">({normalizedAiAnswers.length})</span>
        </span>

        <button
            class="btn btn-xs btn-ghost"
        >
            <Icon
                icon={isAnswersListOpen ? "mdi:chevron-up" : "mdi:chevron-down"}
                width="18"
                height="18"
                class="opacity-90 shrink-0"
            />
        </button>
    </div>

    {#if isAnswersListOpen}
        <div class="rounded-2xl border border-base-300 bg-base-100 overflow-hidden">
            {#if normalizedAiAnswers.length === 0}
                <p class="px-4 py-3 text-xs opacity-70">No AI answers available.</p>
            {:else}
                {#each normalizedAiAnswers as answer, index (`${answer.id}-${index}`)}
                    {#key $selectedChatAnswerIds}
                        {@const isSelectedInAnswerIds = selectedChatAnswerIds.isSelected(answer.id)}
                        {@const isSelectedPeriodical = periodicalSelectedAnswerIds.includes(answer.id)}

                        <div
                            class="border-b last:border-b-0 {isSelectedPeriodical ? "border-sky-500 bg-sky-500/20" : "border-base-300"} {isSelectedInAnswerIds ? "bg-base-200" : ""}"
                            oncontextmenu={onContextMenuChatAnswer(answer)}
                            title={isSelectedInAnswerIds ? "Answer is attached to chat context" : ""}
                        >
                            <div class="flex items-start justify-between gap-3 px-4 py-3">
                                <button
                                    type="button"
                                    onclick={() => toggleAnswer(index)}
                                >
                                    {#if isExpanded(index)}
                                        <div class="text-sm leading-6 whitespace-pre-wrap break-words">
                                            <AIAnswerRichContent content={answer.answerTipTapHTML ?? ""} />
                                        </div>
                                    {:else}
                                        <div class="relative max-h-20 overflow-hidden text-sm leading-6 whitespace-pre-wrap break-words">
                                            <AIAnswerRichContent content={answer.answerTipTapHTML ?? ""} />
                                            <div class="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-base-100 to-transparent"></div>
                                        </div>
                                    {/if}
                                </button>

                                <div class="flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        class="btn btn-ghost btn-xs"
                                        title="Zoom answer"
                                        aria-label="Zoom answer"
                                        onclick={() => openZoom(index)}
                                    >
                                        <Icon icon="material-symbols:zoom-in-map-rounded" width="14" height="14" />
                                    </button>

                                    <div class="text-right">
                                        <button
                                            type="button"
                                            class="text-right"
                                            onclick={() => toggleAnswer(index)}
                                        >
                                        <p class="text-sm font-semibold opacity-80">{formatDate(answer.endDateTimestamp ?? answer.startDateTimestamp ?? Date.now())}</p>
                                        </button>

                                        <div class="flex items-center justify-end gap-2 mt-1">
                                            <div class="badge badge-outline badge-xs">
                                                <span title={getProviderName(answer.model.provider)}>
                                                    <Icon
                                                        icon={getProviderIcon(answer.model.provider)}
                                                        class="w-3 h-3"
                                                    />
                                                </span>
                                                <span>
                                                    {answer.model.name}
                                                </span>
                                            </div>

                                            {#if !$isSharedRoute && $canManageWorkspaceFiles && !isReadOnly}
                                                <button
                                                    type="button"
                                                    class="btn btn-error btn-xs h-5 gap-1"
                                                    title="Delete answer"
                                                    aria-label="Delete answer"
                                                    onclick={() => openRemoveAnswer(index)}
                                                >
                                                    <Icon icon="mdi:trash-can-outline" width="14" height="14" />
                                                </button>
                                            {/if}
                                            
                                            <!-- Info Modal for Answer -->
                                            <button
                                                type="button"
                                                class="btn btn-xs h-4 btn-neutral"
                                                title="Answer details"
                                                aria-label="Open answer details"
                                                onclick={() => openInfo(index)}
                                            >
                                                <Icon icon="material-symbols:info-i-rounded"/>
                                            </button>

                                            <button
                                                type="button"
                                                class="btn btn-xs h-5"
                                                title={isExpanded(index) ? "Collapse answer" : "Expand answer"}
                                                aria-label={isExpanded(index) ? "Collapse answer" : "Expand answer"}
                                                onclick={() => toggleAnswer(index)}
                                            >
                                                <Icon
                                                    icon={isExpanded(index) ? "mdi:chevron-up" : "mdi:chevron-down"}
                                                    width="18"
                                                    height="18"
                                                    class="opacity-90 shrink-0"
                                                />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    {/key}
                {/each}
            {/if}
        </div>
    {/if}
</section>

{#if zoomedAnswer}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-[80] bg-black/40" onclick={closeZoom}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="flex items-center justify-center p-4" onclick={(event) => event.stopPropagation()}>
            <UI.Modals.ModalWrapper
                name="AI answer"
                open={true}
                closeOnBackdrop={true}
                size={{ custom: "max-w-3/4" }}
                modalClassExtension="h-[80vh]"
                on:close={closeZoom}
            >
                <div class="flex items-center justify-between py-2 pb-10">
                    <h3 class="non-margin-heading text-2xl font-semibold">AI Answer</h3>
                    <button
                        type="button"
                        class="btn btn-ghost btn-circle btn-sm"
                        onclick={closeZoom}
                        aria-label="Close AI answer modal"
                        title="Close"
                    >
                        <Icon icon="material-symbols:close-rounded" class="w-5 h-5" />
                    </button>
                </div>

                <div class="space-y-2 h-full mb-4">
                    <div class="flex items-center justify-between text-xs opacity-80">
                        <span>{zoomedAnswer.model.name}</span>
                        <span>{formatDate(zoomedAnswer.endDateTimestamp ?? zoomedAnswer.startDateTimestamp ?? Date.now())}</span>
                    </div>

                    <div class="h-full overflow-auto rounded border border-base-300 bg-base-100 px-4 py-3 text-sm leading-6 whitespace-pre-wrap break-words">
                        <AIAnswerRichContent content={zoomedAnswer.answerTipTapHTML ?? ""} />
                    </div>
                </div>
            </UI.Modals.ModalWrapper>
        </div>
    </div>
{/if}

{#if answerContextMenu}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="ai-answer-context-menu dropdown dropdown-open fixed z-[95]"
        style={`left: ${answerContextMenu.x}px; top: ${answerContextMenu.y}px;`}
        onclick={(event) => {
            event.preventDefault();
            event.stopPropagation();
        }}
        oncontextmenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
        }}
    >
        <ul class="menu dropdown-content z-[1] w-[200px] rounded-box border border-base-300 bg-base-100 p-1 shadow-xl">
            <li>
                {#if selectedChatAnswerIds.isSelected(answerContextMenu.answer.id)}
                    <button
                        type="button"
                        class="justify-start gap-2"
                        onclick={onRemoveFromContext}
                    >
                        <Icon icon="material-symbols:add-notes-rounded" width="16" height="16" />
                        <span>Remove from AI-Chat Context</span>
                    </button>
                {:else}
                    <button
                        type="button"
                        class="justify-start gap-2"
                        onclick={onAddSelectionToAiChatContext}
                    >
                        <Icon icon="material-symbols:add-notes-rounded" width="16" height="16" />
                        <span>Add to AI-Chat Context</span>
                    </button>
                {/if}
            </li>
        </ul>
    </div>
{/if}

{#if removeAnswer}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-[95] bg-black/40" onclick={closeRemoveAnswer}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="flex items-center justify-center p-4" onclick={(event) => event.stopPropagation()}>
            <UI.Modals.ModalWrapper
                name="Remove AI answer"
                open={true}
                closeOnBackdrop={true}
                size="xl"
                on:close={closeRemoveAnswer}
            >
                <UI.Modals.ModalWrapperHeading
                    headingName="Remove AI answer"
                    on:close={closeRemoveAnswer}
                />

                <div class="space-y-4">
                    <p class="text-sm text-base-content/80">
                        Do you want to remove answer?
                        This action cannot be undone.
                    </p>

                    <div class="relative rounded border border-base-300 bg-base-100 px-3 py-2 text-sm">
                        <span class="uppercase font-semibold bg-base-100 text-xs text-gray-500 absolute top-[-0.5rem]">Answer</span>
                        <div class="w-full h-fit">
                            <AIAnswerRichContent content={removeAnswer.answerTipTapHTML ?? ""} />
                        </div>
                    </div>

                    <div class="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            onclick={closeRemoveAnswer}
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            class="btn btn-error btn-sm gap-2"
                            onclick={removeAnswerFromItem}
                        >
                            <Icon icon="mdi:trash-can-outline" width="16" height="16" />
                            <span>Remove answer</span>
                        </button>
                    </div>
                </div>
            </UI.Modals.ModalWrapper>
        </div>
    </div>
{/if}

{#if infoAnswer}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-[90] bg-black/40" onclick={closeInfo}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="flex items-center justify-center p-4" onclick={(event) => event.stopPropagation()}>
            <UI.Modals.ModalWrapper
                name="AI answer settings"
                open={true}
                closeOnBackdrop={true}
                size="2xl"
                on:close={closeInfo}
            >
                <div class="flex items-center justify-between py-2">
                    <h3 class="non-margin-heading text-2xl font-semibold">AI Answer Details</h3>
                    <button
                        type="button"
                        class="btn btn-ghost btn-circle btn-sm"
                        onclick={closeInfo}
                        aria-label="Close AI answer settings modal"
                        title="Close"
                    >
                        <Icon icon="material-symbols:close-rounded" class="w-5 h-5" />
                    </button>
                </div>

                <div class="space-y-3">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <div class="rounded border border-base-300 bg-base-100 px-3 py-2">
                            <p class="text-xs uppercase tracking-wide opacity-70">Play Mode</p>
                            <p class="mt-1 font-medium">{getPlayModeLabel(infoAnswer.playMode)}</p>
                        </div>

                        <div class="rounded border border-base-300 bg-base-100 px-3 py-2">
                            <p class="text-xs uppercase tracking-wide opacity-70">MCP servers</p>
                            <p class="mt-1 font-medium break-words">
                                {infoMcpServers.length > 0 ? infoMcpServers.join(', ') : 'None'}
                            </p>
                        </div>

                        <div class="rounded border border-base-300 bg-base-100 px-3 py-2">
                            <p class="text-xs uppercase tracking-wide opacity-70">Tools</p>
                            <p class="mt-1 font-medium break-words">
                                {infoTools.length > 0 ? infoTools.join(', ') : 'None'}
                            </p>
                        </div>
                    </div>

                    <div class="rounded border border-base-300 bg-base-100 px-3 py-2 space-y-2">
                        <div>
                            <p class="text-xs uppercase tracking-wide opacity-70">Context</p>
                            <p class="text-xs opacity-70 mt-1">Resources used in this run.</p>
                        </div>

                        {#if !hasInfoContextResources}
                            <p class="text-xs opacity-60">No context resources were used.</p>
                        {:else}
                            <div class="space-y-2">
                                <div class="space-y-1">
                                    <p class="text-[11px] uppercase tracking-wide opacity-60">Desktop files</p>

                                    {#if infoContextPayload.desktopFiles.length === 0}
                                        <p class="text-xs opacity-60">No desktop files used.</p>
                                    {/if}

                                    <div class="space-y-1 max-h-28 overflow-auto">
                                        {#each infoContextPayload.desktopFiles as file (file.id)}
                                            <div class="flex items-center gap-2 rounded border border-base-300 px-2 py-1" title={file.locationHint}>
                                                {#if file.previewDataUrl}
                                                    <img src={file.previewDataUrl} alt={file.name} class="w-8 h-8 rounded object-cover" />
                                                {:else}
                                                    <Icon icon="material-symbols:description-outline-rounded" class="w-5 h-5 opacity-70" />
                                                {/if}

                                                <span class="text-xs truncate">{file.name}</span>
                                            </div>
                                        {/each}
                                    </div>
                                </div>

                                <div class="space-y-1">
                                    <p class="text-[11px] uppercase tracking-wide opacity-60">Editor files</p>

                                    {#if infoContextPayload.editorFiles.length === 0}
                                        <p class="text-xs opacity-60">No editor files used.</p>
                                    {/if}

                                    <div class="space-y-1 max-h-28 overflow-auto">
                                        {#each infoContextPayload.editorFiles as file (file.id)}
                                            <div class="flex items-center gap-2 rounded border border-base-300 px-2 py-1">
                                                <Icon icon="material-symbols:article-outline-rounded" class="w-5 h-5 opacity-70" />
                                                <span class="text-xs truncate">{file.name}</span>
                                            </div>
                                        {/each}
                                    </div>
                                </div>

                                <div class="space-y-1">
                                    <p class="text-[11px] uppercase tracking-wide opacity-60">Network URLs</p>

                                    {#if infoContextPayload.networkUrls.length === 0}
                                        <p class="text-xs opacity-60">No URLs used.</p>
                                    {/if}

                                    <div class="space-y-1 max-h-28 overflow-auto">
                                        {#each infoContextPayload.networkUrls as entry (entry.id)}
                                            <div class="flex items-center gap-2 rounded border border-base-300 px-2 py-1">
                                                {#if entry.favicon}
                                                    <img src={entry.favicon} alt="website favicon" class="w-4 h-4" />
                                                {:else}
                                                    <Icon icon="material-symbols:link-rounded" class="w-4 h-4 opacity-70" />
                                                {/if}

                                                <span class="text-xs truncate">{entry.url}</span>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            </div>
                        {/if}
                    </div>

                    <div class="rounded border border-base-300 bg-base-100 px-3 py-2">
                        <p class="text-xs uppercase tracking-wide opacity-70">Answer</p>
                        <pre class="mt-1 text-xs whitespace-pre-wrap break-words max-h-52 overflow-auto">{infoAnswer.answerTipTapHTML}</pre>
                    </div>
                </div>
            </UI.Modals.ModalWrapper>
        </div>
    </div>
{/if}
