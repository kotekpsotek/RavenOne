import TaskList from '@tiptap/extension-task-list';

export const StandardTaskList = TaskList.extend({
    name: 'standardTaskList',

    addOptions() {
        const parentOptions = this.parent?.();

        return {
            HTMLAttributes: parentOptions?.HTMLAttributes ?? {},
            itemTypeName: 'standardTaskItem',
        };
    },

    addCommands() {
        return {};
    },

    addInputRules() {
        return [];
    },

    addKeyboardShortcuts() {
        return {};
    },

    parseHTML() {
        return [
            {
                tag: 'ul[data-type="standardTaskList"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        const existingClass = (HTMLAttributes.class as string | undefined)?.trim();
        const mergedClass = existingClass
            ? `${existingClass} list-none p-0`
            : 'list-none p-0';

        return ['ul', { ...HTMLAttributes, class: mergedClass, 'data-type': 'standardTaskList' }, 0];
    },
});
