import BulletList from '@tiptap/extension-bullet-list';

export const StandardBulletList = BulletList.extend({
    name: 'standardBulletList',

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
                tag: 'ul[data-type="standardBulletList"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['ul', { ...HTMLAttributes, 'data-type': 'standardBulletList' }, 0];
    },
});
