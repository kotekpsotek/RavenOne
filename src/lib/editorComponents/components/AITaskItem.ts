import TaskItem from '@tiptap/extension-task-item';
import { SvelteNodeViewRenderer } from 'svelte-tiptap';
import AITaskItemSvelte from '../ui/AITaskItem.svelte';

export const AITaskItem = TaskItem.configure({
    nested: true,
}).extend({
    name: 'taskItem',

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
