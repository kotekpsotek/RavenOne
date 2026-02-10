<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Placeholder from '@tiptap/extension-placeholder';
  import { RavenHeading, RavenAiTask, SlashCommand } from '$lib/editorExtensions';
  import { getActiveDocument, playSignal } from '$lib/state.svelte';

  let element: HTMLElement;
  let editor: Editor | undefined = $state(undefined);

  const activeDoc = $derived(getActiveDocument());

  // Watch for Play Signal
  $effect(() => {
     // We just read the value to track dependency
     const _ = playSignal.value;
     // Ideally we check if it incremented.
     // Since this effect runs on change, it means it was clicked.
     if (editor && _ > 0) {
         console.log('Playing AI Tasks...');
         // Visual feedback?
         // We could iterate over docs and flash them
     }
  });

  let lastDocId = '';

  $effect(() => {
      if (activeDoc && activeDoc.id !== lastDocId) {
          lastDocId = activeDoc.id;
          if (editor && !editor.isDestroyed) {
              // If content is empty/default, try to populate
              if (!activeDoc.content || Object.keys(activeDoc.content).length === 0) {
                  // Init with heading
                   editor.commands.setContent({
                     type: 'doc',
                     content: [
                       {
                         type: 'ravenHeading',
                         attrs: { title: activeDoc.title, description: 'Document Description' }
                       },
                       {
                         type: 'paragraph'
                       }
                     ]
                   });
              } else {
                  editor.commands.setContent(activeDoc.content);
              }
          }
      }
  });

  onMount(() => {
    editor = new Editor({
      element: element,
      extensions: [
        StarterKit,
        Placeholder.configure({
            placeholder: 'Type "/" for commands...',
        }),
        RavenHeading,
        RavenAiTask,
        SlashCommand
      ],
      content: '', 
      editorProps: {
        attributes: {
            class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl m-auto focus:outline-none max-w-3xl prose-h1:hidden mt-8', 
        },
      },
      onUpdate: ({ editor }) => {
         if (activeDoc) {
             const json = editor.getJSON();
             activeDoc.content = json;
             
             // Also update title if heading changes?
             const heading = json.content?.find(n => n.type === 'ravenHeading');
             if (heading) {
                 if (heading.attrs?.title) activeDoc.title = heading.attrs.title;
                 // Sync icon and wallpaper to doc state if we want to use them elsewhere (e.g. sidebar)
                 if (heading.attrs?.icon) activeDoc.icon = heading.attrs.icon;
             }
         }
      },
    });
  });

  onDestroy(() => {
    if (editor) {
      editor.destroy();
    }
  });
</script>

<div class="flex flex-col h-full bg-base-100 overflow-hidden relative">
   <div bind:this={element} class="flex-1 overflow-y-auto px-4 sm:px-8 py-8"></div>
</div>

<style>
/* Custom overrides for editor integration */
:global(.ProseMirror) {
    min-height: 100%;
    outline: none !important;
}
:global(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: #adb5bd;
  pointer-events: none;
  height: 0;
}
</style>
