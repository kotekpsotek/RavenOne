import TaskItem from '@tiptap/extension-task-item';

export const StandardTaskItem = TaskItem.configure({
    nested: true,
}).extend({
    name: 'standardTaskItem',

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
            ? `${existingClass} flex items-start gap-2 my-1`
            : 'flex items-start gap-2 my-1';

        return [
            'li',
            {
                ...HTMLAttributes,
                class: mergedClass,
                'data-type': 'standardTaskItem',
                'data-checked': node.attrs.checked,
            },
            [
                'label',
                { class: 'flex items-center mt-1 cursor-pointer' },
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
            ['div', 0],
        ];
    },
});
