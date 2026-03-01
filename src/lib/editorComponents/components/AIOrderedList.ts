import OrderedList from '@tiptap/extension-ordered-list';
import { SvelteNodeViewRenderer } from 'svelte-tiptap';
import AIOrderedListSvelte from '../ui/AIOrderedList.svelte';
import type { AIList } from '../types/AIList';
import type { Attribute } from '@tiptap/core';
import { v4 as uuid } from 'uuid';

export const AIOrderedList = OrderedList.extend({
    name: 'orderedList',

    addOptions() {
        const parentOptions = this.parent?.();

        return {
            HTMLAttributes: parentOptions?.HTMLAttributes ?? {},
            keepMarks: parentOptions?.keepMarks ?? false,
            keepAttributes: parentOptions?.keepAttributes ?? false,
            itemTypeName: 'listItem',
        };
    },

    addAttributes() {
        return {
            aiAnswers: {
                default: "[]"
            },
            id: {
                default: `listElement-${uuid()}`
            }
        } as Record<keyof AIList, Attribute>;
    },

    parseHTML() {
        return [
            {
                tag: 'ol[data-type="aiOrderedList"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['ol', { ...HTMLAttributes, 'data-type': 'aiOrderedList' }, 0];
    },

    addNodeView() {
        return SvelteNodeViewRenderer(AIOrderedListSvelte);
    },
});
