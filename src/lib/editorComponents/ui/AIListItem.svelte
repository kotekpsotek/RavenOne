<script lang="ts">
    import { dev } from '$app/environment';
    import { tick } from 'svelte';
    import { NodeViewWrapper, NodeViewContent } from 'svelte-tiptap';
    import type { NodeViewProps } from '@tiptap/core';
    import { v4 as uuidv4 } from 'uuid';
    import ListItemHoverActions from './mod/AIListItemHoverActions.svelte';
    import AIAnswersList from './mod/AIAnswersList.svelte';
    import { hoveredListItemId, mouseOutTimeout } from '../../stores/hoveredListItem';
    import { getAIAnswers } from '../types/AIList';
    import type { AIPoint } from '../types/AIList';

    let { node, updateAttributes, extension }: NodeViewProps = $props();
    const aiAnswers = $derived(getAIAnswers(node["attrs"]["aiAnswers"]));
    const simulatedAiAnswers: AIPoint["aiAnswers"] = [
        {
            playMode: "run-all",
            dateTimestamp: Date.now() - 1000 * 60 * 8,
            model: {
                id: "gpt-5.2",
                name: "GPT-5.2",
                provider: "OpenAI",
                weight: 1
            },
            context: [],
            mcp: false,
            tools: {
                webSearch: true
            },
            answerTipTapHTML: "<p>Answer content 1</p>"
        },
        {
            playMode: "run-non-runned",
            dateTimestamp: Date.now() - 1000 * 60 * 4,
            model: {
                id: "gpt-5.2",
                name: "GPT-5.2",
                provider: "OpenAI",
                weight: 1
            },
            context: [],
            mcp: false,
            tools: {
                webSearch: true
            },
            answerTipTapHTML: "<p>Answer content 1</p><p>Answer content 1</p><p>Answer content 1</p>"
        }
    ];
    const visibleAiAnswers = $derived(
        aiAnswers !== null && aiAnswers.length > 0
            ? aiAnswers
            : dev
                ? simulatedAiAnswers
                : null
    );
    
    const itemId = `list-${uuidv4()}`;
    let contentHostElement = $state<HTMLDivElement | null>(null);
    let answersContainerElement = $state<HTMLDivElement | null>(null);

    function handleMouseEnter() {
        mouseOutTimeout.clearTimeout();
        hoveredListItemId.set(itemId);
    }

    function handleMouseLeave() {
        mouseOutTimeout.setTimeout();
    }

    function resolveContentElement() {
        const queriedContentElement = contentHostElement?.querySelector('[data-node-view-content]') as HTMLElement | null;
        const fallbackContentElement = contentHostElement?.firstElementChild as HTMLElement | null;
        return queriedContentElement ?? fallbackContentElement ?? contentHostElement;
    }

    function placeAnswersBetweenTextAndNestedPoints() {
        if (!answersContainerElement || visibleAiAnswers === null || visibleAiAnswers.length === 0) {
            return;
        }

        const contentElement = resolveContentElement();
        if (!contentElement) {
            return;
        }

        const answersContainer = answersContainerElement;

        const firstNestedList = Array.from(contentElement.querySelectorAll('ul, ol')).find((listElement) => {
            if (!(listElement instanceof HTMLElement)) {
                return false;
            }

            return !answersContainer.contains(listElement);
        }) as HTMLElement | undefined;

        if (firstNestedList && firstNestedList.parentElement) {
            if (
                answersContainerElement.parentElement !== firstNestedList.parentElement ||
                answersContainerElement.nextElementSibling !== firstNestedList
            ) {
                firstNestedList.parentElement.insertBefore(answersContainerElement, firstNestedList);
            }
            return;
        }

        if (answersContainerElement.parentElement !== contentElement) {
            contentElement.appendChild(answersContainerElement);
        }
    }

    $effect(() => {
        void visibleAiAnswers;
        void contentHostElement;
        void answersContainerElement;
        void node;

        let disposed = false;
        let observer: MutationObserver | null = null;

        tick().then(() => {
            if (disposed) {
                return;
            }

            placeAnswersBetweenTextAndNestedPoints();

            const contentElement = resolveContentElement();
            if (!contentElement || !answersContainerElement || visibleAiAnswers === null || visibleAiAnswers.length === 0) {
                return;
            }

            observer = new MutationObserver(() => {
                placeAnswersBetweenTextAndNestedPoints();
            });
            observer.observe(contentElement, { childList: true, subtree: true });
        });

        return () => {
            disposed = true;
            observer?.disconnect();
        };
    });
</script>

<NodeViewWrapper
    as="li"
    class="custom-list-item my-1 relative"
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
>
    <ListItemHoverActions 
        visible={$hoveredListItemId === itemId}
        {itemId}
        aiAnswers={visibleAiAnswers}
    />

    <div bind:this={contentHostElement}>
        <NodeViewContent as="div" class="w-full" />
    </div>

    {#if visibleAiAnswers !== null && visibleAiAnswers.length > 0}
        <div class="mt-2 w-full" contenteditable="false" bind:this={answersContainerElement}>
            <AIAnswersList aiAnswers={visibleAiAnswers} />
        </div>
    {/if}

</NodeViewWrapper>
