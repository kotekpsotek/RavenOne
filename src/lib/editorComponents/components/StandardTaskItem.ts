import TaskItem from '@tiptap/extension-task-item';
import { SvelteNodeViewRenderer } from 'svelte-tiptap';
import StandardTaskItemSvelte from '../ui/StandardTaskItem.svelte';

export const StandardTaskItem = TaskItem.configure({
    nested: true,
}).extend({
    name: 'standardTaskItem',

    addInputRules() {
        return [];
    },

    addOptions() {
        const parentOptions = this.parent?.();

        return {
            nested: parentOptions?.nested ?? true,
            HTMLAttributes: parentOptions?.HTMLAttributes ?? {},
            onReadOnlyChecked: parentOptions?.onReadOnlyChecked,
            a11y: parentOptions?.a11y,
            taskListTypeName: 'standardTaskList',
        };
    },

    parseHTML() {
        return [
            {
                tag: 'li[data-type="standardTaskItem"]',
            },
        ];
    },

    renderHTML({ node, HTMLAttributes }) {
        const existingClass = (HTMLAttributes.class as string | undefined)?.trim();
        const mergedClass = existingClass
            ? `${existingClass} list-none my-1`
            : 'list-none my-1';
        const existingStyle = (HTMLAttributes.style as string | undefined)?.trim();
        const mergedStyle = existingStyle
            ? `${existingStyle}; list-style-type: none !important; display: grid !important; grid-template-columns: auto minmax(0, 1fr); align-items: start; column-gap: 0.5rem;`
            : 'list-style-type: none !important; display: grid !important; grid-template-columns: auto minmax(0, 1fr); align-items: start; column-gap: 0.5rem;';

        return [
            'li',
            {
                ...HTMLAttributes,
                class: mergedClass,
                style: mergedStyle,
                'data-type': 'standardTaskItem',
                'data-checked': node.attrs.checked,
            },
            [
                'label',
                { class: 'flex items-center cursor-pointer', style: 'grid-column: 1;' },
                [
                    'input',
                    {
                        type: 'checkbox',
                        class: 'checkbox checkbox-sm checkbox-primary',
                        checked: node.attrs.checked ? 'checked' : null,
                    },
                ],
                ['span'],
            ],
            ['div', { class: 'min-w-0', style: 'grid-column: 2; min-width: 0;' }, 0],
        ];
    },

    addNodeView() {
        return SvelteNodeViewRenderer(StandardTaskItemSvelte);
    },
});
