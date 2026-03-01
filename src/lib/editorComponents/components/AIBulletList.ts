import BulletList from '@tiptap/extension-bullet-list';
import { SvelteNodeViewRenderer } from 'svelte-tiptap';
import AIBulletListSvelte from '../ui/AIBulletList.svelte';

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
