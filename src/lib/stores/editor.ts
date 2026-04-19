import { createEditor } from "svelte-tiptap";
import type { Editor as SvelteEditor } from "svelte-tiptap";
import { Document } from "@tiptap/extension-document";
import { Placeholder } from "@tiptap/extension-placeholder";
import { get, writable } from "svelte/store";
import { StarterKit } from "@tiptap/starter-kit"
import { patchFileById, selectedFile } from "./files";
import { isWorkspaceInAddition, isWorkspaceSelectionOpen, SwitchWorkspaceEvent } from "./workspace";
import { FileHeading } from "../editorComponents/components/Heading";
import { SlashCommand } from "../editorComponents/components/Suggestions.js";
import { StandardTaskList } from "../editorComponents/components/StandardTaskList.js";
import { StandardTaskItem } from "../editorComponents/components/StandardTaskItem.js";
import { CodeSnippet } from "../editorComponents/components/CodeSnippet.js";
import type { File } from "@ravenlens/shared";
import { collaborationInterface, isCurrentUserSelectedFileEditor } from "./collaboration.js";
import { browser } from "$app/environment";
import { editorAIChat } from "./aiRightSideChat.js";
import type { Extension } from "@tiptap/core";

type YoutubeExtensionType = {
    configure: (options: {
        addPasteHandler: boolean;
        width: number;
        height: number;
        nocookie: boolean;
        modestBranding: boolean;
        HTMLAttributes: {
            class: string;
        };
    }) => unknown;
};

let youtubeExtensionPromise: Promise<YoutubeExtensionType | null> | undefined;

function isViteOutdatedOptimizeDepError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("Outdated Optimize Dep") || message.includes("Failed to fetch dynamically imported module");
}

async function loadYoutubeExtension() {
    if (!browser) {
        return null;
    }

    if (!youtubeExtensionPromise) {
        youtubeExtensionPromise = (async () => {
            try {
                const module = await import("@tiptap/extension-youtube");
                return (module.default ?? (module as { Youtube?: YoutubeExtensionType }).Youtube) ?? null;
            } catch (error) {
                if (!isViteOutdatedOptimizeDepError(error)) {
                    throw error;
                }

                // Vite can briefly return "Outdated Optimize Dep" while refreshing prebundled chunks.
                await new Promise(resolve => setTimeout(resolve, 120));
                const retriedModule = await import("@tiptap/extension-youtube");
                return (retriedModule.default ?? (retriedModule as { Youtube?: YoutubeExtensionType }).Youtube) ?? null;
            }
        })().catch((error) => {
            youtubeExtensionPromise = undefined;
            throw error;
        });
    }

    return youtubeExtensionPromise;
}

function normalizeContent(content?: string): string {
    if (!content || !content.trim()) {
        return "<p></p>";
    }

    return content;
}

export async function createEditorExtensions() {
    //
    const HeadingStartDocument = Document.extend({
        // https://tiptap.dev/api/schema#content
        content: 'fileHeading block block*',
    });
    
    const youtubeExtension = await loadYoutubeExtension().catch((error) => {
        console.warn("Unable to load @tiptap/extension-youtube", error);
        return null;
    });
    console.log(youtubeExtension)
    
    return [
        StarterKit.configure({
            document: false,
            codeBlock: false,
        }),
        FileHeading,
        HeadingStartDocument,
        Placeholder.configure({
            placeholder: ({ node }) => {
                if (node.type.name === "fileHeading") {
                    return "Document Name";
                }

                return "Type one-by-one with curiosity...";
            },
            includeChildren: true,
            showOnlyCurrent: false,
        }),
        StandardTaskList,
        StandardTaskItem,
        SlashCommand,
        ...(youtubeExtension ? [
            youtubeExtension.configure({
                addPasteHandler: true,
                width: 640,
                height: 360,
                nocookie: true,
                modestBranding: true,
                HTMLAttributes: {
                    class: "tiptap-youtube-embed"
                }
            })
        ] : []),
        // Custom Components
        CodeSnippet
    ] as Extension[];
}

export const editor = (() => {
    const { subscribe, set, update } = writable<SvelteEditor | undefined>(undefined);
    let currentEditor: SvelteEditor | undefined;
    let activeFileId: string | undefined;
    let fileUpdationTimer: NodeJS.Timeout | null = null;

    /** Clear timer for scenarios:
     * 1. User selects differnet file
     * 2. User selects new workspace
    */
    function clearTimer() {
        if (fileUpdationTimer) {
            clearTimeout(fileUpdationTimer);
        }
    }

    if (browser) {
        SwitchWorkspaceEvent.listen((oldWorkspace, newWorkspace) => {
            clearTimer();
        })
    }
    
    const store = {
        subscribe,
        update,
        async selectFile(file: File.File.File) {
            const content = normalizeContent(file.content);
            activeFileId = file.id;
            
            //
            isWorkspaceSelectionOpen.set(false);
            isWorkspaceInAddition.set(false);

            //
            if (!currentEditor) {
                const editorStore = createEditor({
                    content,
                    extensions: await createEditorExtensions(),
                    onUpdate(props) {
                        if (!activeFileId) {
                            return;
                        }

                        patchFileById(activeFileId, {
                            content: props.editor.getHTML()
                        });

                        // Send file update once atime
                        fileUpdationTimer = setTimeout(() => {
                            const isCurrentUserSelectedFileEditorLocal = get(isCurrentUserSelectedFileEditor); 

                            if (!isCurrentUserSelectedFileEditorLocal) {
                                if (fileUpdationTimer) {
                                    clearTimeout(fileUpdationTimer);
                                };
                                
                                return;
                            }

                            if (fileUpdationTimer) {
                                clearTimeout(fileUpdationTimer);
                                fileUpdationTimer = null;
                            }
                        }, 2_500);
                    },
                    onSelectionUpdate(props) {
                        const { state } = props.editor;
                        const { from, to, empty } = state.selection;

                        if (empty) {
                            return;
                        }

                        const text = state.doc.textBetween(from, to, ' ');
                        if (!text.trim()) {
                            return;
                        }

                        editorAIChat.selectText({ from, to }, text);
                    }
                });
                
                // Track the instance and update the store
                editorStore.subscribe(instance => {
                    if (instance) {
                        currentEditor = instance;
                        set(instance);
                    }
                });
            } else {
                currentEditor.commands.setContent(content);
            }
        },
        setEditionState(toState: boolean) {
            update(editorState => editorState?.setEditable(toState)!);
        }
    };

    // Auto-select whenever selectedFile store changes
    selectedFile.subscribe(async file => {
        if (file && (file.id !== activeFileId || !currentEditor)) {
            await store.selectFile(file);
            clearTimer();   
        }
    });

    return store;
})();
