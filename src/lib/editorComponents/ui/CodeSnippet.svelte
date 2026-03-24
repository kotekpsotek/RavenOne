<!-- Blured customnode doesn't cause this event to be caused on main editor context -->
<!-- Why I cannot use Backspace in $editable within tiptap editor? Answer: contenteditable=false is required for each custom node where merely specific part has to be editable, this also makes codemirror editable with bakspace in prosemirror instance -->
<script lang="ts">
    import type { NodeViewProps } from "@tiptap/core";
    import Icon from "@iconify/svelte";
    import { NodeViewWrapper } from "svelte-tiptap";
    import { theme } from "$lib/stores/theme";
    import CodeMirror from "svelte-codemirror-editor";
    /* Importinh code-mirror 6 languages */
    import { type LanguageSupport } from "@codemirror/language"
    import { html } from '@codemirror/lang-html'; // Example language
    import { javascript } from "@codemirror/lang-javascript";
    import { markdown } from "@codemirror/lang-markdown";
    import { python } from "@codemirror/lang-python";
    import { json } from "@codemirror/lang-json";
    import { rust } from "@codemirror/lang-rust";
    import { css } from "@codemirror/lang-css";
    import { go } from "@codemirror/lang-go";
    /* Codemirror themes */
    import { oneDark } from "@codemirror/theme-one-dark"
    import { onDestroy } from "svelte";
    import type { CodeSnippetNodeParams } from "../components/CodeSnippet";
    import "./CodeSnippet.css";

    type SupportedLanguage = "HTML" | "JSON" | "YAML" | "XML" | "CSS" | "Markdown" | "Mermaid" | "txt" | "plaintext" | "javascript" | "typescript" | "rust" | "python" | "c" | "c++" | "sql" | "java" | "bash" | "shell" | "cmd" | "powershell" | "c#" | "Go" | "less" | "scss" | "svelte";
    
    let { node, editor, updateAttributes }: NodeViewProps = $props();

    let nodeAttrs = $derived(node.attrs as CodeSnippetNodeParams | undefined);

    const supportedLanguagesList: SupportedLanguage[] = [
        "HTML", "JSON", "XML", "CSS", "Markdown", "Mermaid", "txt", "plaintext", "javascript", "typescript", "rust", "python", "c", "c++", "sql", "java", "bash", "shell", "cmd", "powershell", "c#", "Go", "less", "scss", "svelte"
    ];
    let codeMirrorPickedUpLang = $derived.by(() => selectLanguageSyntaxHighlighting(nodeAttrs?.language));
    let dontAllowEditorToBeUpdatedByBlur = $state(false);
    let isDarkMode = $derived($theme === "dark");
    let isEditable = $derived(editor?.isEditable ?? false);
    let description = $state("");
    let isEditingDescription = $state(false);
    let descriptionFlushTimeout: ReturnType<typeof setTimeout> | null = null;
    let descriptionEl = $state<HTMLElement | null>(null);
    let currentCode = $derived(nodeAttrs?.code ?? "");
    let isCopied = $state(false);
    let copiedResetTimeout: ReturnType<typeof setTimeout> | null = null;

    let isDescriptionAdding = $state(false);

    function getNextAttrs(overrides: Partial<CodeSnippetNodeParams> = {}): CodeSnippetNodeParams {
        return {
            language: overrides.language ?? nodeAttrs?.language ?? "plaintext",
            code: overrides.code ?? currentCode,
            description: overrides.description ?? description,
        };
    }

    // keep local description in sync with node attrs when not actively editing
    $effect(() => {
        if (isEditingDescription) return;
        const fromNode = nodeAttrs?.description ?? "";
        if (fromNode !== description) {
            description = fromNode;
            if (descriptionEl && descriptionEl.textContent !== fromNode) {
                descriptionEl.textContent = fromNode;
            }
        }
    });

    // Logic
    /// In near future -> replace alert to custom one
    function onCopy() {
        navigator.clipboard.writeText(currentCode ?? "");

        isCopied = true;

        if (copiedResetTimeout) {
            clearTimeout(copiedResetTimeout);
        }

        copiedResetTimeout = setTimeout(() => {
            isCopied = false;
            copiedResetTimeout = null;
        }, 10_000);
    }

    function onDescriptionInput(ev: Event) {
        const el = (ev.currentTarget as HTMLParagraphElement);
        const next = (el.textContent ?? "");
        // Keep local value and avoid replacing DOM while user types
        description = next;
        isEditingDescription = true;
        if (!next.length) isDescriptionAdding = false;

        if (descriptionFlushTimeout) clearTimeout(descriptionFlushTimeout);
        descriptionFlushTimeout = setTimeout(() => {
            updateAttributes(getNextAttrs({ description: description }));
            descriptionFlushTimeout = null;
            isEditingDescription = false;
        }, 250);
    }

    function onDescriptionBlur() {
        if (descriptionFlushTimeout) {
            clearTimeout(descriptionFlushTimeout);
            descriptionFlushTimeout = null;
            updateAttributes(getNextAttrs({ description: description }));
        }
        isEditingDescription = false;
    }

    /* TODO: Support more languages */
    function selectLanguageSyntaxHighlighting(language: string | undefined): LanguageSupport {
        switch(language?.toLowerCase()) {
            case "typescript":
            case "javascript":
                return javascript();

            case "json":
                return json();
            
            case "html":
                return html();

            case "css":
                return css();

            case "plaintext":
            case "markdown":
                return markdown();

            case "python":
                return python();

            case "rust":
                return rust();

            case "go":
                return go();
            
            default:
                return markdown();
        }
    }

    /** TODO: Add support for more languages than barelly few */
    function onLanguageChanged(ev: Event) {
        const selectEl = ev.currentTarget as HTMLSelectElement;
        const selectedLanguage = selectEl.value as SupportedLanguage;
        
        // Updates the picked up language to selected one
        updateAttributes(getNextAttrs({
            language: selectedLanguage
        }))

        dontAllowEditorToBeUpdatedByBlur = false;
    }

    function onCodeChanged(nextCode: string) {
        updateAttributes(getNextAttrs({
            code: nextCode
        }))
    }

    function onAddDescription() {
        isDescriptionAdding = true;
        updateAttributes(getNextAttrs({
            description: ""
        }));

        setTimeout(() => {
            descriptionEl?.focus();
        }, 50);
    }

    function onSnippetKeydown(event: KeyboardEvent) {
        const isDeleteKey = event.key === "Backspace" || event.key === "Delete";
        const target = event.target as HTMLElement | null;
        const fromCodeMirror = !!target?.closest(".cm-editor");

        if (isDeleteKey && fromCodeMirror) {
            event.stopPropagation();
        }
    }

    onDestroy(() => {
        if (copiedResetTimeout) {
            clearTimeout(copiedResetTimeout);
        }
    });

    // codeMirrorPickedUpLang.subscribe(lang => console.log("Selected language is: ", lang))
</script>

<!-- This can be:
                1. My custom extension which hasn't nice code editor currently
                2. Tiptap svelte editor wrapper with tiptap-lowlight extension
            -->
            <!-- <EditorContent editor={$editor}/> -->
<NodeViewWrapper>
    <div role="group" contenteditable="false" onkeydown={onSnippetKeydown} class="h-fit w-full flex overflow-hidden flex-col border border-base-300 bg-base-200 rounded-lg">
        <div class="upper-stripe flex justify-between items-center px-1 my-1">
            <select name="allowed-languages" disabled={!isEditable} class="select select-xs outline-none border-none w-fit min-w-[100px] p-0 capitalize p-1 text-sm bg-transparent rounded-md text-base-content hover:bg-base-300" onclick={_ => dontAllowEditorToBeUpdatedByBlur = true} onchange={onLanguageChanged}>
                {#each supportedLanguagesList as allowedLanguage (allowedLanguage)}
                    <option class="bg-base-100 text-base-content" value={allowedLanguage} selected={allowedLanguage === nodeAttrs?.language}>{allowedLanguage}</option>
                {/each}
            </select>
            <button class="p-0 capitalize p-1 px-1.5 text-sm flex gap-1 items-center hover:bg-base-300 rounded-md text-base-content" onclick={onCopy}>
                {#if isCopied}
                    <Icon icon="mingcute:check-2-line" class="text-green-500" width="16" height="16" />
                    <p class="text-green-500">Copied</p>
                {:else}
                    <Icon icon="mingcute:copy-2-line" width="16" height="16" />
                    <p>Copy</p>
                {/if}
            </button>
        </div>
        <div id="code" class="bg-base-100 overflow-y-auto">
            <!-- TODO: Configure theme, add cover when content changed via: on:change event -->
            {#key isDarkMode || !isDarkMode || codeMirrorPickedUpLang}
                <CodeMirror
                    class="code-mirror-of-code-snippet"
                    value={currentCode}
                    editable={isEditable}
                    lang={codeMirrorPickedUpLang}
                    theme={isDarkMode ? oneDark : undefined}
                    onchange={onCodeChanged}
                    styles={{
                        "&": {
                            fontSize: "18px",
                            lineHeight: "1.5"
                        }
                    }}
                />
            {/key}
        </div>
        {#if nodeAttrs?.description || isDescriptionAdding}
            <div id="code-snippet-description" class="p-2">
                <span class="font-semibold text-sm text-base-content/70">Description</span>
                <p id="description-content" bind:this={descriptionEl} contenteditable={isEditable} oninput={onDescriptionInput} onblur={onDescriptionBlur} data-placeholder="Type Description..." class="text-base-content border-none outline-none" class:darkmodeContentEditable={isDarkMode && isEditable}></p>
            </div>
        {:else if isEditable}
            <button class="flex items-center gap-2 m-1 p-2 text-base-content/70 hover:text-base-content" onclick={onAddDescription}>
                <Icon icon="mingcute:add-line" width="16" height="16" />
                <span>
                    Add Description
                </span>
            </button>
        {/if}
    </div>

    <style>
        /* Target the horizontal scrollbar */
        ::-webkit-scrollbar {
        height: 8px; /* Adjust height as needed */
        }
    
        ::-webkit-scrollbar-track {
        background: #f1f1f1; /* Track background color */
        border-radius: 4px; /* Rounded corners for the track */
        }
    
        ::-webkit-scrollbar-thumb {
        background: #888; /* Thumb (draggable part) color */
        border-radius: 4px; /* Rounded corners for the thumb */
        }
    
        ::-webkit-scrollbar-thumb:hover {
        background: #555; /* Thumb color on hover */
        }
        
        p[contenteditable="true"]:empty::before {
            @apply text-sm;
            content: attr(data-placeholder);
            color: gray;
            pointer-events: none;
            display: block;
        }
    </style>
</NodeViewWrapper>