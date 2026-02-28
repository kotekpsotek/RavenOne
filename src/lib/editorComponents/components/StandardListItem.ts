import ListItem from '@tiptap/extension-list-item';

export const StandardListItem = ListItem.extend({
    name: 'standardListItem',

    parseHTML() {
        return [
            {
                tag: 'li[data-type="standardListItem"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['li', { ...HTMLAttributes, 'data-type': 'standardListItem' }, 0];
    },
});
