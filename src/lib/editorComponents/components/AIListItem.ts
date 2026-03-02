/* It's the item usd for both lists: ordered and unordered */
import ListItem from '@tiptap/extension-list-item';
import { SvelteNodeViewRenderer } from 'svelte-tiptap';
import AIListItemSvelte from '../ui/AIListItem.svelte';
import type { AIPoint } from '../types/AIList';
import type { Attribute } from '@tiptap/core';
import { v4 as uuid } from "uuid";

export const AIListItem = ListItem.extend({
    name: 'listItem',

    addAttributes() {
        return {
            aiAnswers: {
                default: "[]"
            },
            id: {
                default: null
            }
        } as Record<keyof AIPoint, Attribute>;
    },

    addNodeView() {
        return SvelteNodeViewRenderer(AIListItemSvelte);
    },
});
