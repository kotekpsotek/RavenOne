import { Node, mergeAttributes } from '@tiptap/core';
import { SvelteNodeViewRenderer } from 'svelte-tiptap';
import HeadingNode from './components/editor/nodes/HeadingNode.svelte';
import AiTaskNode from './components/editor/nodes/AiTaskNode.svelte';
import { SlashCommand } from './components/editor/extensions/slash-command';

export { SlashCommand };

export const RavenHeading = Node.create({
  name: 'ravenHeading',
  group: 'block',
  content: '', // It manages its own state via attributes/inputs in the view
  atom: true,  // It's a leaf node in Tiptap's eyes (no content editing via Tiptap engine, handled by Svelte view)
               // Users text inputs in the component updates attributes.

  addAttributes() {
    return {
      title: {
        default: '',
      },
      description: {
        default: '',
      },
      icon: {
        default: null,
      },
      wallpaper: {
        default: null,
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'raven-heading',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['raven-heading', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return SvelteNodeViewRenderer(HeadingNode);
  },
});

export const RavenAiTask = Node.create({
  name: 'ravenAiTask',
  group: 'block',
  content: 'inline*', // Rich text content
  
  addAttributes() {
    return {
      checked: {
        default: false,
      },
      task: {
        default: '',
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'raven-ai-task',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['raven-ai-task', mergeAttributes(HTMLAttributes), 0];
  },

  addKeyboardShortcuts() {
    return {
      'Enter': () => this.editor.commands.splitBlock(),
    };
  },

  addNodeView() {
    return SvelteNodeViewRenderer(AiTaskNode);
  },
});
