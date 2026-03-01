<script lang="ts">
    import { dev } from '$app/environment';
    import { tick, type ComponentEvents } from 'svelte';
    import { NodeViewWrapper, NodeViewContent } from 'svelte-tiptap';
    import type { NodeViewProps } from '@tiptap/core';
    import { v4 as uuid } from 'uuid';
    import ListItemHoverActions from './mod/AIListItemHoverActions.svelte';
    import AIAnswersList from './mod/AIAnswersList.svelte';
    import { hoveredListItemId, mouseOutTimeout } from '../../stores/hoveredListItem';
    import { getAIAnswers } from '../types/AIList';
    import type { AIPoint } from '../types/AIList';

    let { node, updateAttributes, editor, deleteNode }: NodeViewProps = $props();
    const aiAnswers = $derived(getAIAnswers(node["attrs"]["aiAnswers"]));
    const itemId = $derived((node["attrs"]["id"] as string | undefined) ?? "");

    let contentHostElement = $state<HTMLDivElement | null>(null);
    let answersContainerElement = $state<HTMLDivElement | null>(null);
    
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

    function handleChange(event: Event) {
        const target = event.target as HTMLInputElement;
        updateAttributes({ checked: target.checked });
    }

    function handleMouseEnter() {
        mouseOutTimeout.clearTimeout();
        hoveredListItemId.set(itemId);
    }

    function handleMouseLeave() {
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

    function ensureUniqueItemId() {
        if (!itemId || !isUniqueItemId(itemId)) {
            updateAttributes({ id: `listItem-${uuid()}` });
        }
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
        ensureUniqueItemId();
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
</script>

<NodeViewWrapper 
    as="li" 
    class="custom-task-item flex items-start gap-2 my-1 relative"
    data-type="taskItem"
    data-checked={node.attrs.checked}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
>
    <ListItemHoverActions
        visible={$hoveredListItemId === itemId}
        {itemId}
        aiAnswers={visibleAiAnswers}
        onDeletePoint={onDeletePoint}
    />
    <label class="flex items-center mt-1 cursor-pointer">
        <input 
            type="checkbox" 
            class="checkbox checkbox-sm checkbox-primary" 
            checked={node.attrs.checked}
            title="Checkbox will be checked-out once ai has resolved"
            onchange={handleChange} 
            onclick={handleCheckBoxClick}
        />
    </label>
    <div class="flex-1">
        <div bind:this={contentHostElement}>
            <NodeViewContent as="div" class="w-full" />
        </div>

        {#if visibleAiAnswers !== null && visibleAiAnswers.length > 0}
            <div class="mt-2" contenteditable="false" bind:this={answersContainerElement}>
                <AIAnswersList aiAnswers={visibleAiAnswers} />
            </div>
        {/if}
    </div>
</NodeViewWrapper>
