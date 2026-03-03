<script lang="ts">
    import { dev } from '$app/environment';
    import { onDestroy, onMount, tick } from 'svelte';
    import { NodeViewWrapper, NodeViewContent } from 'svelte-tiptap';
    import type { NodeViewProps } from '@tiptap/core';
    import { v4 as uuid } from 'uuid';
    import ListItemHoverActions from './mod/AIListItemHoverActions.svelte';
    import AIAnswersList from './mod/AIAnswersList.svelte';
    import { clickedListItemId, hoveredListItemId, mouseOutTimeout } from '../../stores/hoveredListItem';
    import { getAIAnswers } from '../types/AIList';
    import type { AIPoint } from '../types/AIList';
    import AITaskOpenButton from './mod/AITaskOpenButton.svelte';
    import AITaskPlayingState from './mod/AITaskPlayingState.svelte';
    import { onRemovePlayablePoint, PointAnswerUpdation } from '$lib/playMode';
    import { selectedFile } from '$lib/stores/files';

    let nodeViewProps = $props();
    // svelte-ignore state_referenced_locally
    let { node, updateAttributes, editor, deleteNode }= nodeViewProps;
    let aiAnswers = $derived(getAIAnswers(node["attrs"]["aiAnswers"]));
    let itemId = $derived((node["attrs"]["id"] as string | undefined) ?? "");

    const simulatedAiAnswers: AIPoint["aiAnswers"] = [
        /* {
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
            answerTipTapHTML: `
                <h2>Xee</h2>
                <p>Answer <b>content 1</b></p>
                <p>This is a much longer response designed to test how the UI handles significant amounts of content. When an AI generates a comprehensive answer, it often spans multiple paragraphs and includes various formatting elements.</p>
                <p>For instance, we might see a breakdown of steps:</p>
                <ul>
                    <li><b>Step 1:</b> Initial analysis of the user's request and context.</li>
                    <li><b>Step 2:</b> Retrieval of relevant information from integrated tools or knowledge bases.</li>
                    <li><b>Step 3:</b> Synthesis of the gathered data into a coherent and helpful response.</li>
                </ul>
                <br>
                <p>Furthermore, long-form content helps us evaluate the scrolling behavior, the layout within the list item, and how the "ListItemHoverActions" interact with an expanded container. If the content is too long, does it push the next list item too far down? Does it maintain readability?</p>
                <p>Let's add some more filler text here to really stretch the container. The quick brown fox jumps over the lazy dog. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
                <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
                <pre><code>// Example code block
function testPerformance() {
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
        console.log("Testing...");
    }
    console.log("Time elapsed:", Date.now() - start);
}</code></pre>
                <p>Final thoughts: Testing with realistic data volumes is crucial for ensuring a robust user experience, especially in text-heavy applications like editors.</p>
            `
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
        } */
    ];
    const visibleAiAnswers = $derived(
        aiAnswers !== null && aiAnswers.length > 0
            ? aiAnswers
            : dev
                ? simulatedAiAnswers
                : null
    );
    
    let contentHostElement = $state<HTMLDivElement | null>(null);
    let answersContainerElement = $state<HTMLDivElement | null>(null);

    function isRelatedToOwnAnswersArea(event: MouseEvent) {
        if (!itemId) {
            return false;
        }

        const relatedElement = event.relatedTarget;
        if (!(relatedElement instanceof Element)) {
            return false;
        }

        const answersRoot = relatedElement.closest('[data-ai-answers-root="true"]');
        return answersRoot?.getAttribute('data-list-item-id') === itemId;
    }

    function isPointerWithinOwnAnswersArea(event: MouseEvent) {
        if (!itemId) {
            return false;
        }

        const pointedElement = document.elementFromPoint(event.clientX, event.clientY);
        if (!(pointedElement instanceof Element)) {
            return false;
        }

        const answersRoot = pointedElement.closest('[data-ai-answers-root="true"]');
        return answersRoot?.getAttribute('data-list-item-id') === itemId;
    }

    function handleMouseEnter(event: MouseEvent) {
        if (isRelatedToOwnAnswersArea(event) || isPointerWithinOwnAnswersArea(event)) {
            return;
        }

        mouseOutTimeout.clearTimeout();
        hoveredListItemId.set(itemId);
    }

    function handleMouseLeave(event: MouseEvent) {
        if (isRelatedToOwnAnswersArea(event) || isPointerWithinOwnAnswersArea(event)) {
            return;
        }

        mouseOutTimeout.setTimeout();
    }

    function onDeletePoint() {
        mouseOutTimeout.clearTimeout();
        hoveredListItemId.set(null);
        deleteNode();
    }

    function isUniqueItemId(id: string) {
        let occurrences = 0;

        editor.state.doc.descendants((docNode: any) => {
            const isTargetNodeType = docNode.type.name === 'listItem' || docNode.type.name === 'taskItem';
            if (!isTargetNodeType) {
                return true;
            }

            if ((docNode.attrs.id as string | undefined) === id) {
                occurrences += 1;
            }

            return true;
        });

        return occurrences === 1;
    }

    function ensureUniqueItemId(itemId: string) {
        if (!itemId.trim().length || !isUniqueItemId(itemId)) {
            const id = `listItem-${uuid()}`;
            updateAttributes({ id: id });
            return id;
        }

        return itemId;
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
        itemId = ensureUniqueItemId(itemId);
    });

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

    onMount(() => {
        new PointAnswerUpdation(itemId)
            .listen(aiAnswer => {
                // Update attrs
                updateAttributes({
                    ...node["attrs"],
                    id: itemId,
                    aiAnswers: [...(aiAnswers ?? []), aiAnswer]
                });

                // Add ai answer
                aiAnswers = [
                    ...(aiAnswers ?? []),
                    aiAnswer
                ];
            })
    });

    onDestroy(() => {
        onRemovePlayablePoint($selectedFile, itemId);
    });
</script>

<NodeViewWrapper
    class="flex gap-5 items-start w-full min-w-0"
>
    <AITaskOpenButton {itemId}/>

    <li
        class="custom-list-item flex-1 min-w-0 my-1 relative list-item"
        onmouseenter={handleMouseEnter}
        onmouseleave={handleMouseLeave}
    >
        <ListItemHoverActions 
            visible={$hoveredListItemId === itemId || $clickedListItemId === itemId}
            {itemId}
            aiAnswers={visibleAiAnswers}
            onDeletePoint={onDeletePoint}
            {nodeViewProps}
        />
    
        <div bind:this={contentHostElement} class="w-full min-w-0">
            <NodeViewContent as="div" class="w-full whitespace-pre-wrap break-words"/>
        </div>
    
        {#if visibleAiAnswers !== null && visibleAiAnswers.length > 0}
            <div class="mt-2 w-full" contenteditable="false" bind:this={answersContainerElement}>
                <AIAnswersList aiAnswers={visibleAiAnswers} {itemId} />
            </div>
        {/if}
    </li>

    <AITaskPlayingState 
        {itemId}
    />
</NodeViewWrapper>
