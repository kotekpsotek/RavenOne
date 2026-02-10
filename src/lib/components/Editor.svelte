<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';

	let element: HTMLDivElement;
	let editor: Editor;

	onMount(() => {
		editor = new Editor({
			element: element,
			extensions: [StarterKit],
			content: '<p>Hello TipTap!</p>',
			autofocus: true
		});
	});

	onDestroy(() => {
		if (editor) {
			editor.destroy();
		}
	});
</script>

<div bind:this={element} class="tiptap-editor"></div>

<style>
	:global(.tiptap-editor .tiptap) {
		border: 1px solid #ccc;
		padding: 1rem;
		min-height: 200px;
		border-radius: 4px;
	}

	:global(.tiptap-editor .tiptap:focus) {
		outline: none;
		border-color: #007bff;
	}
</style>
