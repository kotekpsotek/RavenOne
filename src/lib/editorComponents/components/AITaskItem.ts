import TaskItem from '@tiptap/extension-task-item';
import { SvelteNodeViewRenderer } from 'svelte-tiptap';
import AITaskItemSvelte from '../ui/AITaskItem.svelte';
import type { AIPoint } from '../types/AIList';
import type { Attribute } from '@tiptap/core';
import { v4 as uuid } from "uuid";

export const AITaskItem = TaskItem.configure({
    nested: true,
}).extend({
    name: 'taskItem',

    addAttributes() {
        return {
            aiAnswers: {
                default: "[]"
            },
            id: {
                default: null
            }
        } as Record<keyof AIPoint, Attribute>;
    },
    
    addOptions() {
        const parentOptions = this.parent?.();

        return {
            nested: parentOptions?.nested ?? true,
            HTMLAttributes: parentOptions?.HTMLAttributes ?? {},
            onReadOnlyChecked: parentOptions?.onReadOnlyChecked,
            a11y: parentOptions?.a11y,
            taskListTypeName: 'taskList',
        };
    },

    addNodeView() {
        return SvelteNodeViewRenderer(AITaskItemSvelte);
    },
});
