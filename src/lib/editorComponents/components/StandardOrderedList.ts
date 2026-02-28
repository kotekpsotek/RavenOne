import OrderedList from '@tiptap/extension-ordered-list';

export const StandardOrderedList = OrderedList.extend({
    name: 'standardOrderedList',

    addOptions() {
        const parentOptions = this.parent?.();

        return {
            HTMLAttributes: parentOptions?.HTMLAttributes ?? {},
            keepMarks: parentOptions?.keepMarks ?? false,
            keepAttributes: parentOptions?.keepAttributes ?? false,
            itemTypeName: 'standardListItem',
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
                tag: 'ol[data-type="standardOrderedList"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['ol', { ...HTMLAttributes, 'data-type': 'standardOrderedList' }, 0];
    },
});
