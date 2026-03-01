import TaskList from '@tiptap/extension-task-list';
import { SvelteNodeViewRenderer } from 'svelte-tiptap';
import AITaskListSvelte from '../ui/AITaskList.svelte';

export const AITaskList = TaskList.extend({
    name: 'taskList',

    addOptions() {
        const parentOptions = this.parent?.();

        return {
            HTMLAttributes: parentOptions?.HTMLAttributes ?? {},
            itemTypeName: 'taskItem',
        };
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
