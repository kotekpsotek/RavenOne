import { createEditor } from "svelte-tiptap";
import type { Editor as SvelteEditor } from "svelte-tiptap";
import { Document } from "@tiptap/extension-document";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { get, writable } from "svelte/store";
import { StarterKit } from "@tiptap/starter-kit"
import { patchFileById, selectedFile } from "./files";
import { isWorkspaceInAddition, isWorkspaceSelectionOpen, SwitchWorkspaceEvent } from "./workspace";
import { FileHeading } from "../editorComponents/components/Heading";
import { SlashCommand } from "../editorComponents/components/Suggestions.js";
import { StandardTaskList } from "../editorComponents/components/StandardTaskList.js";
import { StandardTaskItem } from "../editorComponents/components/StandardTaskItem.js";
import { CodeSnippet } from "../editorComponents/components/CodeSnippet.js";
import { RavenImage } from "../editorComponents/components/RavenImage.js";
import { AmongDocumentReference } from "../editorComponents/components/AmongDocumentReference";
import { RavenTableView } from "../editorComponents/components/RavenTableView.svelte";
import { File } from "@ravenlens/shared";
import { collaborationInterface, isCurrentUserSelectedFileEditor } from "./collaboration.js";
import { browser } from "$app/environment";

function normalizeContent(content?: string): string {
    if (!content || !content.trim()) {
        return "<p></p>";
    }

    return content;
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
            const HeadingStartDocument = Document.extend({
                // https://tiptap.dev/api/schema#content
                content: 'fileHeading block block*',
            });

            //
            if (!currentEditor) {
                const editorStore = createEditor({
                    content,
                    editorProps: {
                        attributes: {
                            class: "tiptap",
                        },
                    },
                    extensions: [
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
                        // Custom Components
                        CodeSnippet,
                        AmongDocumentReference,
                        RavenImage,
                        TableKit.configure({
                            table: {
                                resizable: true,
                                View: RavenTableView,
                                HTMLAttributes: {
                                    class: "raven-table",
                                },
                            },
                        }),
                    ],
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
    selectedFile.subscribe(file => {
        if (file && (file.id !== activeFileId || !currentEditor)) {
            store.selectFile(file);
            clearTimer();   
        }
    });

    return store;
})();
