import ListItem from '@tiptap/extension-list-item';
import { SvelteNodeViewRenderer } from 'svelte-tiptap';
import AIListItemSvelte from '../ui/AIListItem.svelte';

export const AIListItem = ListItem.extend({
    name: 'listItem',

    addNodeView() {
        return SvelteNodeViewRenderer(AIListItemSvelte);
    },
});
