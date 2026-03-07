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
    import { EditorView } from "@codemirror/view";
    import { oneDark } from "@codemirror/theme-one-dark"
    import { onDestroy, onMount } from "svelte";
    import type { CodeSnippetNodeParams } from "../components/CodeSnippet";
    import "./CodeSnippet.css";

    type SupportedLanguage = "HTML" | "JSON" | "YAML" | "XML" | "CSS" | "Markdown" | "Mermaid" | "txt" | "plaintext" | "javascript" | "typescript" | "rust" | "python" | "c" | "c++" | "sql" | "java" | "bash" | "shell" | "cmd" | "powershell" | "c#" | "Go" | "less" | "scss" | "svelte";
    
    let { node, editor, updateAttributes }: NodeViewProps = $props();

    let nodeAttrs = $derived(node.attrs as CodeSnippetNodeParams | undefined);

    const myTheme = EditorView.theme({
        "&": {
            fontSize: "18px", // Adjust font size as needed
            lineHeight: "1.5", // Adjust line height as needed
        },
    });
    const supportedLanguagesList: SupportedLanguage[] = [
        "HTML", "JSON", "XML", "CSS", "Markdown", "Mermaid", "txt", "plaintext", "javascript", "typescript", "rust", "python", "c", "c++", "sql", "java", "bash", "shell", "cmd", "powershell", "c#", "Go", "less", "scss", "svelte"
    ];
    let codeMirrorPickedUpLang = $state<LanguageSupport | undefined>(undefined);
    let dontAllowEditorToBeUpdatedByBlur = $state(false);
    let isDarkMode = $derived($theme === "dark");
    let isEditable = $derived(editor?.isEditable ?? false);
    let description = $state("");
    let currentCode = $state("");
    let isCopied = $state(false);
    let copiedResetTimeout: ReturnType<typeof setTimeout> | null = null;

    let isDescriptionAdding = $state(false);

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

        if (!el.textContent?.length) {
            el.textContent = "";
            isDescriptionAdding = false;
            updateAttributes({
                ...nodeAttrs,
                description: ""
            })
        }
        else {
            updateAttributes({
                ...nodeAttrs,
                description: el.textContent ?? ""
            })
        }
    }

    /* TODO: Support more languages */
    function selectLanguageSyntaxHighlighting(language: string | undefined) {
        switch(language?.toLowerCase()) {
            case "typescript":
            case "javascript":
                codeMirrorPickedUpLang = javascript();
            break;

            case "json":
                codeMirrorPickedUpLang = json();
            break;
            
            case "html":
                codeMirrorPickedUpLang = html();
            break;

            case "css":
                codeMirrorPickedUpLang = css();
            break;

            case "plaintext":
            case "markdown":
                codeMirrorPickedUpLang = markdown();
            break;

            case "python":
                codeMirrorPickedUpLang = python();
            break;

            case "rust":
                codeMirrorPickedUpLang = rust();
            break;

            case "go":
                codeMirrorPickedUpLang = go();
            break;
            
            default:
                codeMirrorPickedUpLang = markdown()
        }
    }

    /** TODO: Add support for more languages than barelly few */
    function onLanguageChanged(ev: Event) {
        const selectEl = ev.currentTarget as HTMLSelectElement;
        const selectedLanguage = selectEl.value as SupportedLanguage;
        
        // Updates the picked up language to selected one
        updateAttributes({
            ...nodeAttrs,
            language: selectedLanguage
        } as CodeSnippetNodeParams)

        //
        selectLanguageSyntaxHighlighting(selectedLanguage);

        dontAllowEditorToBeUpdatedByBlur = false;
    }

    function onCodeChanged(nextCode: string) {
        currentCode = nextCode;

        updateAttributes({
            ...nodeAttrs,
            code: nextCode
        } as CodeSnippetNodeParams)
    }

    function onAddDescription() {
        isDescriptionAdding = true;
        description = "";
        updateAttributes({
            ...nodeAttrs,
            description: ""
        } as CodeSnippetNodeParams);

        setTimeout(() => {
            document.getElementById("description-content")?.focus();
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

    onMount(() => {
        description = nodeAttrs?.description ?? ""
        currentCode = nodeAttrs?.code ?? "";
        
        // Required to apply the syntax highlighting
        setTimeout(() => {            
            selectLanguageSyntaxHighlighting(nodeAttrs?.language)
        }, 500);
    })

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
                    <option class="bg-base-100 text-base-content" value="{allowedLanguage.toLocaleLowerCase()}" selected={allowedLanguage.toLocaleLowerCase() === nodeAttrs?.language?.toLocaleLowerCase()}>{allowedLanguage}</option>
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
                <CodeMirror class="code-mirror-of-code-snippet" value={currentCode} editable={isEditable} lang={codeMirrorPickedUpLang} extensions={[myTheme]} theme={isDarkMode ? oneDark : undefined} onchange={onCodeChanged}/>
            {/key}
        </div>
        {#if nodeAttrs?.description || isDescriptionAdding}
            <div id="code-snippet-description" class="p-2">
                <span class="font-semibold text-sm text-base-content/70">Description</span>
                <p id="description-content" contenteditable={isEditable} oninput={onDescriptionInput} data-placeholder="Type Description..." class="text-base-content border-none outline-none" class:darkmodeContentEditable={isDarkMode && isEditable}>{description}</p>
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