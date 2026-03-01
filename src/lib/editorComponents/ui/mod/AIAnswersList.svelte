<script lang="ts">
    import Icon from "@iconify/svelte";
    import { UI } from "@ravenlens/frontend";
    import AIAnswerRichContent from "./AIAnswerRichContent.svelte";
    import type { AIPoint } from "$lib/editorComponents/types/AIList";

    let { aiAnswers }: { aiAnswers: AIPoint["aiAnswers"] } = $props();

    let openAnswers = $state<Record<number, boolean>>({});
    let zoomedIndex = $state<number | null>(null);

    function isExpanded(index: number) {
        return !!openAnswers[index];
    }

    function toggleAnswer(index: number) {
        openAnswers = {
            ...openAnswers,
            [index]: !openAnswers[index]
        };
    }

    function openZoom(index: number) {
        zoomedIndex = index;
    }

    function closeZoom() {
        zoomedIndex = null;
    }

    function formatDate(timestamp: number) {
        return new Date(timestamp).toLocaleString();
    }

    function toPreviewText(htmlContent: string) {
        return htmlContent
            .replace(/<br\s*\/?\>/gi, "\n")
            .replace(/<\/p>/gi, "\n")
            .replace(/<[^>]*>/g, " ")
            .replace(/\u00a0/g, " ")
            .replace(/\s+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    const zoomedAnswer = $derived(zoomedIndex === null ? null : aiAnswers[zoomedIndex] ?? null);
</script>

<section class="space-y-2" contenteditable="false">
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
                            <p class="line-clamp-2 text-sm opacity-90">{toPreviewText(answer.answerTipTapHTML) || "Answer"}</p>
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
                                <p class="text-[11px] opacity-80">{formatDate(answer.dateTimestamp)}</p>
                                <div class="flex items-center justify-end gap-1">
                                    <span class="badge badge-outline badge-xs">{answer.model.name}</span>
                                    <Icon icon={isExpanded(index) ? "mdi:chevron-up" : "mdi:chevron-down"} width="14" height="14" />
                                </div>
                            </button>
                        </div>
                    </div>

                    {#if isExpanded(index)}
                        <div class="px-4 pb-4 text-sm leading-6 whitespace-pre-wrap break-words">
                            <AIAnswerRichContent content={answer.answerTipTapHTML} />
                        </div>
                    {/if}
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
        <div class="flex min-h-full items-center justify-center p-4" onclick={(event) => event.stopPropagation()}>
            <UI.Modals.ModalWrapper
                name="AI answer"
                open={true}
                closeOnBackdrop={true}
                size="lg"
                on:close={closeZoom}
            >
                <UI.Modals.ModalWrapperHeading headingName="AI Answer" on:close={closeZoom} />

                <div class="pt-2 space-y-2">
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


