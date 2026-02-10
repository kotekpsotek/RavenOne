import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { mount, unmount } from 'svelte';
import tippy, { type Instance } from 'tippy.js';
import CommandsList from '../components/CommandsList.svelte';

const Command = Extension.create({
  name: 'slash-command',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: any) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

const getSuggestionItems = ({ query }: { query: string }) => {
  return [
    {
      title: 'AI Task',
      description: 'Track an AI task',
      icon: 'material-symbols:robot-2-outline',
      command: ({ editor, range }: any) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: 'ravenAiTask', attrs: { checked: false } })
          .run();
      },
    },
    {
      title: 'Text',
      description: 'Just start typing with plain text',
      icon: 'material-symbols:text-fields',
      command: ({ editor, range }: any) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .toggleNode('paragraph', 'paragraph')
          .run();
      },
    },
    {
      title: 'Heading 1',
      description: 'Big section heading',
      icon: 'material-symbols:format-h1',
      command: ({ editor, range }: any) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode('heading', { level: 1 })
          .run();
      },
    },
    {
      title: 'Heading 2',
      description: 'Medium section heading',
      icon: 'material-symbols:format-h2',
      command: ({ editor, range }: any) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode('heading', { level: 2 })
          .run();
      },
    },
    {
      title: 'Heading 3',
      description: 'Small section heading',
      icon: 'material-symbols:format-h3',
      command: ({ editor, range }: any) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode('heading', { level: 3 })
          .run();
      },
    },
    {
      title: 'Bullet List',
      description: 'Create a simple bullet list',
      icon: 'material-symbols:format-list-bulleted',
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: 'Numbered List',
      description: 'Create a list with numbering',
      icon: 'material-symbols:format-list-numbered',
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
  ].filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase())
  );
};

export const SlashCommand = Command.configure({
    suggestion: {
        items: getSuggestionItems,
        render: () => {
            let component: any;
            let popup: Instance[];
            let element: HTMLElement;
            let currentProps: any;

            return {
                onStart: (props: any) => {
                    element = document.createElement('div');
                    currentProps = props;
                    
                    component = mount(CommandsList, {
                        target: element,
                        props: {
                            items: props.items,
                            command: (item: any) => {
                                item.command(props);
                            },
                        },
                    });

                    if (!props.clientRect) {
                        return;
                    }

                    popup = tippy('body', {
                        getReferenceClientRect: props.clientRect,
                        appendTo: () => document.body,
                        content: element,
                        showOnCreate: true,
                        interactive: true,
                        trigger: 'manual',
                        placement: 'bottom-start',
                    });
                },

                onUpdate(props: any) {
                    currentProps = props;
                    // Svelte 5: We can't update props directly on the instance easily unless we used accessors or bound props store.
                    // But mount returns "exports". If we designed CommandsList to export a state setter it would work.
                    // Or we just remount. Remounting is heavy.
                    // Better: Pass a reactive object or use $state inside CommandsList that we can update?
                    
                    // Workaround for Svelte 5 mount: unmount and mount again is simplest for now, 
                    // OR we can make the component accept a store/state.
                    // However, let's try to unmount/mount for correctness first, or use a custom "update" method if we exported it.
                    
                    // Actually, let's just make CommandsList props reactive if we could pass a state object.
                    // But `props` here are vanilla JS objects passed by Tiptap.
                    
                    // Let's Unmount/Mount for now, or just hack it by keeping `items` in a simple mutable object if Svelte 5 supports it? 
                    // No, `mount` props are initial.
                    
                    // Optimization: We can simply replace the element content.
                    if (component) {
                        unmount(component);
                    }
                    element.innerHTML = '';
                    component = mount(CommandsList, {
                        target: element,
                        props: {
                            items: props.items,
                            command: (item: any) => {
                                item.command(props);
                            },
                        },
                    });

                    if (!props.clientRect) {
                        return;
                    }

                    popup[0].setProps({
                        getReferenceClientRect: props.clientRect,
                    });
                },

                onKeyDown(props: any) {
                     if (props.event.key === 'Escape') {
                        popup[0].hide();
                        return true;
                    }
                    // CommandsList exports onKeyDown? No, we used `export function onKeyDown` in script context of CommandsList?
                    // Wait, `export function` in Svelte 5 `<script module>`? No, in `<script>` it's a component export.
                    // So `component.onKeyDown` is available? 
                    // Yes, standard exports are available on the returned instance in Svelte 5.
                    if (component && component.onKeyDown) {
                         return component.onKeyDown(props);
                    }
                    return false;
                },

                onExit() {
                    if (popup && popup[0]) {
                        popup[0].destroy();
                    }
                    if (component) {
                        unmount(component);
                    }
                    element.remove();
                },
            };
        },
    },
});
