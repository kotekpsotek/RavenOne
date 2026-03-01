import TaskList from '@tiptap/extension-task-list';
import { SvelteNodeViewRenderer } from 'svelte-tiptap';
import AITaskListSvelte from '../ui/AITaskList.svelte';
import type { AIList } from '../types/AIList';
import type { Attribute } from '@tiptap/core';
import { v4 as uuid } from 'uuid';

export const AITaskList = TaskList.extend({
    name: 'taskList',

    addOptions() {
        const parentOptions = this.parent?.();

        return {
            HTMLAttributes: parentOptions?.HTMLAttributes ?? {},
            itemTypeName: 'taskItem',
        };
    },

    addAttributes() {
        return {
            aiAnswers: {
                default: "[]"
            },
            id: {
                default: `listElement-${uuid()}`
            }
        } as Record<keyof AIList, Attribute>;
    },

    parseHTML() {
        return [
            {
                tag: 'ol[data-type="aiTaskList"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['ol', { ...HTMLAttributes, 'data-type': 'aiTaskList' }, 0];
    },

    addNodeView() {
        return SvelteNodeViewRenderer(AITaskListSvelte);
    },
});
