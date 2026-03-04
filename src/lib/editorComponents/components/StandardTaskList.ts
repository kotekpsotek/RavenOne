import TaskList from '@tiptap/extension-task-list';

const CHECKBOX_LIST_TRIGGER = /^\s*\[\]\s*$/;

export const StandardTaskList = TaskList.extend({
    name: 'standardTaskList',
    priority: 1000,

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
        return {
            Enter: () => {
                const { selection } = this.editor.state;

                if (!selection.empty) {
                    return false;
                }

                const { $from } = selection;

                if ($from.parent.type.name !== 'paragraph') {
                    return false;
                }

                const normalizedText = $from.parent.textContent
                    .replace(/\u200B/g, '')
                    .trim();

                if (!CHECKBOX_LIST_TRIGGER.test(normalizedText)) {
                    return false;
                }

                return this.editor
                    .chain()
                    .focus()
                    .deleteRange({ from: $from.start(), to: $from.end() })
                    .toggleList('standardTaskList', 'standardTaskItem')
                    .run();
            },
        };
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
