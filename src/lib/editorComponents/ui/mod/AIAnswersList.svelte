<script lang="ts">
    import Icon from "@iconify/svelte";
    import { UI } from "@ravenlens/frontend";
    import AIAnswerRichContent from "./AIAnswerRichContent.svelte";
    import { getPlayModeLabel, type AIPoint } from "$lib/editorComponents/types/AIList";
    import { hoveredListItemId } from "$lib/stores/hoveredListItem";

    let { aiAnswers, itemId = "" }: { aiAnswers: AIPoint["aiAnswers"]; itemId?: string } = $props();

    let openAnswerIndices = $state<number[]>([]);
    let zoomedIndex = $state<number | null>(null);
    let infoIndex = $state<number | null>(null);

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

    function formatJson(value: unknown) {
        return JSON.stringify(value, null, 2);
    }

    const zoomedAnswer = $derived(zoomedIndex === null ? null : aiAnswers[zoomedIndex] ?? null);
    const infoAnswer = $derived(infoIndex === null ? null : aiAnswers[infoIndex] ?? null);

    function onMouseEnter(ev: Event) {
        ev.stopPropagation();
        ev.preventDefault();
        
        hoveredListItemId.set(null);
    }

    function onMouseLeave() {
        hoveredListItemId.set(null);
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section 
    class="space-y-2 pt-5"
    data-ai-answers-root="true"
    data-list-item-id={itemId}
    contenteditable="false"
    onmouseenter={onMouseEnter}
    onmouseleave={onMouseLeave}
>
    <p class="text-sm font-semibold opacity-90">AI Answers</p>

    <div class="rounded-2xl border border-base-300 bg-base-100 overflow-hidden">
        {#if aiAnswers.length === 0}
            <p class="px-4 py-3 text-xs opacity-70">No AI answers available.</p>
        {:else}
            {#each aiAnswers as answer, index (answer.dateTimestamp + index)}
                <div class="border-b border-base-300 last:border-b-0">
                    <div class="flex items-start justify-between gap-3 px-4 py-3">
                        <button
                            type="button"
                            class="text-left min-w-0 flex-1"
                            onclick={() => toggleAnswer(index)}
                        >
                            {#if isExpanded(index)}
                                <div class="text-sm leading-6 whitespace-pre-wrap break-words">
                                    <AIAnswerRichContent content={answer.answerTipTapHTML} />
                                </div>
                            {:else}
                                <div class="relative max-h-20 overflow-hidden text-sm leading-6 whitespace-pre-wrap break-words">
                                    <AIAnswerRichContent content={answer.answerTipTapHTML} />
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

                            <button
                                type="button"
                                class="text-right"
                                onclick={() => toggleAnswer(index)}
                            >
                                <p class="text-sm font-semibold opacity-80">{formatDate(answer.dateTimestamp)}</p>
                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <div class="flex items-center justify-end gap-2 mt-1">
                                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                                    <div class="badge badge-outline badge-xs" onclick={ev => ev.stopPropagation()}>
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

                                    <!-- Info Modal for Answer -->
                                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                                    <div 
                                        class="btn btn-xs h-4 btn-neutral"
                                        onclick={ev => {
                                            ev.stopPropagation();
                                            openInfo(index);
                                        }}
                                    >
                                        <Icon icon="material-symbols:info-i-rounded"/>
                                    </div>
                                    
                                    <div
                                        class="btn btn-xs btn-ghost"
                                    >
                                        <Icon
                                            icon={isExpanded(index) ? "mdi:chevron-up" : "mdi:chevron-down"}
                                            width="18"
                                            height="18"
                                            class="opacity-90 shrink-0"
                                        />
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>

                </div>
            {/each}
        {/if}
    </div>
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
                size="2xl"
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

                <div class="space-y-2">
                    <div class="flex items-center justify-between text-xs opacity-80">
                        <span>{zoomedAnswer.model.name}</span>
                        <span>{formatDate(zoomedAnswer.dateTimestamp)}</span>
                    </div>

                    <div class="max-h-[60vh] overflow-auto rounded border border-base-300 bg-base-100 px-4 py-3 text-sm leading-6 whitespace-pre-wrap break-words">
                        <AIAnswerRichContent content={zoomedAnswer.answerTipTapHTML} />
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
                    <h3 class="non-margin-heading text-2xl font-semibold">AI Answer Settings</h3>
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
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div class="rounded border border-base-300 bg-base-100 px-3 py-2">
                            <p class="text-xs uppercase tracking-wide opacity-70">Play Mode</p>
                            <p class="mt-1 font-medium">{getPlayModeLabel(infoAnswer.playMode)}</p>
                        </div>

                        <div class="rounded border border-base-300 bg-base-100 px-3 py-2">
                            <p class="text-xs uppercase tracking-wide opacity-70">mcp</p>
                            <p class="mt-1 font-medium">{infoAnswer.mcp ?? false}</p>
                        </div>
                    </div>

                    <div class="rounded border border-base-300 bg-base-100 px-3 py-2">
                        <p class="text-xs uppercase tracking-wide opacity-70">tools</p>
                        <pre class="mt-1 text-xs whitespace-pre-wrap break-words">{formatJson(infoAnswer.tools)}</pre>
                    </div>

                    <div class="rounded border border-base-300 bg-base-100 px-3 py-2">
                        <p class="text-xs uppercase tracking-wide opacity-70">context</p>
                        <pre class="mt-1 text-xs whitespace-pre-wrap break-words max-h-40 overflow-auto">{formatJson(infoAnswer.context)}</pre>
                    </div>

                    <div class="rounded border border-base-300 bg-base-100 px-3 py-2">
                        <p class="text-xs uppercase tracking-wide opacity-70">Asnwer</p>
                        <pre class="mt-1 text-xs whitespace-pre-wrap break-words max-h-52 overflow-auto">{infoAnswer.answerTipTapHTML}</pre>
                    </div>
                </div>
            </UI.Modals.ModalWrapper>
        </div>
    </div>
{/if}
