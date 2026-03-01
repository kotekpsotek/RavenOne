import BulletList from '@tiptap/extension-bullet-list';
import { SvelteNodeViewRenderer } from 'svelte-tiptap';
import AIBulletListSvelte from '../ui/AIBulletList.svelte';
import type { AIList } from '../types/AIList';
import type { Attribute } from '@tiptap/core';
import { v4 as uuid } from 'uuid';

export const AIBulletList = BulletList.extend({
    name: 'bulletList',

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
                tag: 'ul[data-type="aiBulletList"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['ul', { ...HTMLAttributes, 'data-type': 'aiBulletList' }, 0];
    },

    addNodeView() {
        return SvelteNodeViewRenderer(AIBulletListSvelte);
    },
});
