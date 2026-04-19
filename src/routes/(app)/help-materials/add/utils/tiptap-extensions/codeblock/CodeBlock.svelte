<script lang="ts">
	import Icon from '@iconify/svelte';
	import { NodeViewWrapper } from 'svelte-tiptap';
    import CodeMirror from "svelte-codemirror-editor";
    import type { LanguageSupport } from "@codemirror/language";
	import type { NodeViewProps } from '@tiptap/core';
	import { type CodeBlockAttrs } from './CodeBlock';
    import { theme } from '$lib/stores/theme';

	// Codemirror theme
	import { tomorrow } from 'thememirror';
	import { oneDark } from "@codemirror/theme-one-dark"
	import { EditorView } from "@codemirror/view";
	
    // Codemirrror languages
    import { javascript } from "@codemirror/lang-javascript";
    import { json } from "@codemirror/lang-json";
    import { html } from "@codemirror/lang-html";
    import { markdown } from "@codemirror/lang-markdown";
    import { python } from "@codemirror/lang-python";
    import { rust } from "@codemirror/lang-rust"
    import { go } from "@codemirror/lang-go"
    import { onMount } from 'svelte';
 
	// Node view props are injected by tiptap/svelte-tiptap at runtime
	export let editor: NodeViewProps["editor"];
	export let node: NodeViewProps["node"];
	export let updateAttributes: NodeViewProps["updateAttributes"];

	// NOTE: NodeView props are assigned after initial render, so `node` can be
	// temporarily undefined during component initialization.
	$: attributes = (node?.attrs ?? { language: 'plaintext', code: '' }) as CodeBlockAttrs;
	$: code = attributes.code ?? '';

    interface Language {
        value: string;
        label: string;
        language: LanguageSupport
    }
    
	const languages: Language[] = [
		{ value: 'plaintext', label: 'TXT', language: html() },
		{ value: 'javascript', label: 'JS', language: javascript() },
		{ value: 'typescript', label: 'TS', language: javascript() },
		{ value: 'json', label: 'JSON', language: json() },
		{ value: 'bash', label: 'BASH',language: html() },
		{ value: 'html', label: 'HTML',language: html() },
		{ value: 'markdown', label: 'MD', language: markdown() },
		{ value: 'python', label: 'PY', language: python() },
        { value: 'rust', label: 'RS', language: rust() },
        { value: 'go', label: 'GO', language: go() }
	];

	$: language = node?.attrs?.language ?? 'plaintext';
	$: languagesFound = languages.find((l) => l.value === language);
	$: languageLabel = languagesFound?.label ?? (String(language).toUpperCase() || 'TXT');
	$: languageLang = languagesFound?.language ?? html();
	$: myTheme = EditorView.theme({
	    "&": {
	        fontSize: "15px", // Adjust font size as needed
	        lineHeight: "1.5", // Adjust line height as needed
	    },
		// caret-color CSS must be applied to the editable content element
		".cm-content": {
			caretColor: $theme === "light" ? "black" : "white",
		},
		// the visible caret in CodeMirror is rendered as a left border
		".cm-cursor, .cm-dropCursor": {
			borderLeftColor: $theme === "light" ? "black" : "white",
		},
	});
	$: themeCodeMirror = $theme === "light" ? tomorrow : oneDark;

	let isCopied = false;
	let rootEl: HTMLDivElement | null = null;

	function onChangeLanguage(ev: Event) {
		const select = ev.currentTarget as HTMLSelectElement;
		updateAttributes({ language: select.value });
	}

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(code);
			isCopied = true;
		} catch {
			// Ignore clipboard failures silently (permissions, insecure context, etc.)
			isCopied = false;
		}
	}

	onMount(() => console.log(node.attrs))
</script>

<!-- 
    Task:
    1. Implement: npm i svelte-codemirror-editor (Code Mirror editor)

-->

<NodeViewWrapper
	class="not-prose my-4"
	data-ravenlens-codeblock
>
	<div 
		bind:this={rootEl}
		class="w-full overflow-hidden rounded-xl border bg-base-200 border-base-content/10 text-neutral-content"
	>
		<div class="flex items-center justify-between gap-3 border-b border-neutral-content/10 px-3 py-2">
			<div class="flex items-center gap-2 min-w-0">
				{#if editor?.isEditable}
					<select
						class="select select-xs bg-neutral text-neutral-content border-neutral-content/15 focus:outline-none"
						value={language}
						on:change={onChangeLanguage}
						aria-label="Code language"
					>
						{#each languages as l}
							<option value={l.value}>{l.label}</option>
						{/each}
					</select>
				{/if}
			</div>

			<button
				type="button"
				class="btn btn-ghost btn-xs {isCopied ? "text-s" : "text-neutral-content"}"
				on:click|preventDefault={copyToClipboard}
				title={isCopied ? 'Copied' : 'Copy'}
			>
				<Icon icon={isCopied ? 'material-symbols:check' : 'material-symbols:content-copy-outline'} width="16" height="16" />
				<span>{isCopied ? "Copied" : "Copy"} code</span>
			</button>
		</div>

		<div class="overflow-x-auto">
			<CodeMirror 
				editable={editor.isEditable}
				bind:value={code}
				lang={languageLang}
				theme={themeCodeMirror}
				extensions={[myTheme]}
			/>
		</div>
	</div>
</NodeViewWrapper>
