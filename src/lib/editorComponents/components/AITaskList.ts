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

    addNodeView() {
        return SvelteNodeViewRenderer(AITaskListSvelte);
    },
});
