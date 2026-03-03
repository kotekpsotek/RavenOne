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
    import { selectedFile } from '$lib/stores/files';
    import { onRemovePlayablePoint, PointAnswerUpdation } from '$lib/playMode';

    let nodeViewProps: NodeViewProps = $props()
    // svelte-ignore state_referenced_locally
    let { node, updateAttributes, editor, deleteNode } = nodeViewProps;

    let aiAnswers = $derived(getAIAnswers(node["attrs"]["aiAnswers"]));
    let itemId = $derived((node["attrs"]["id"] as string | undefined) ?? "");

    let contentHostElement = $state<HTMLDivElement | null>(null);
    let answersContainerElement = $state<HTMLDivElement | null>(null);
    
    const simulatedAiAnswers: AIPoint["aiAnswers"] = [
        {
            playMode: "run-all",
            startDateTimestamp: (Date.now() - 1000 * 60 * 8) - 50_000,
            endDateTimestamp: (Date.now() - 1000 * 60 * 4),
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
            startDateTimestamp: (Date.now() - 1000 * 60 * 4) - 50_000,
            endDateTimestamp: (Date.now() - 1000 * 60 * 4),
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

    function handleChange(event: Event) {
        const target = event.target as HTMLInputElement;
        updateAttributes({ checked: target.checked });
    }

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

    function handleCheckBoxClick(ev: Event) {
        ev.preventDefault();
    }

    function onDeletePoint() {
        mouseOutTimeout.clearTimeout();
        hoveredListItemId.set(null);
        deleteNode();
    }

    function isUniqueItemId(id: string) {
        let occurrences = 0;

        editor.state.doc.descendants((docNode) => {
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
            updateAttributes({ id });
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
    })
</script>

<NodeViewWrapper 
    data-type="taskItem"
    class="flex gap-2 items-start w-full min-w-0"
    data-checked={node.attrs.checked}
>
    <AITaskOpenButton {itemId}/>

    <li 
        class="custom-task-item flex-1 min-w-0 flex items-start gap-2 my-1 relative"
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
        <label class="flex items-center mt-1 cursor-pointer shrink-0">
            <input 
                type="checkbox" 
                class="checkbox checkbox-sm checkbox-primary" 
                checked={(aiAnswers?.length ?? 0) > 0} // Checked when answers list isn't empty
                title="Checkbox will be checked-out once ai has resolved"
                onchange={handleChange} 
                onclick={handleCheckBoxClick}
            />
        </label>
        <div class="flex-1 min-w-0 w-full overflow-hidden">
            <div bind:this={contentHostElement} class="w-full min-w-0">
                <NodeViewContent as="div" class="w-full whitespace-pre-wrap break-words" />
            </div>
    
            {#if visibleAiAnswers !== null && visibleAiAnswers.length > 0}
                <div class="mt-2 w-full" contenteditable="false" bind:this={answersContainerElement}>
                    <AIAnswersList aiAnswers={visibleAiAnswers} {itemId} />
                </div>
            {/if}
        </div>
    </li>

    <AITaskPlayingState 
        {itemId}
    />
</NodeViewWrapper>
