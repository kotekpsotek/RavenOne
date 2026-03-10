import { createEditor } from "svelte-tiptap";
import type { Editor as SvelteEditor } from "svelte-tiptap";
import { Document } from "@tiptap/extension-document";
import { Placeholder } from "@tiptap/extension-placeholder";
import { get, writable } from "svelte/store";
import { StarterKit } from "@tiptap/starter-kit"
import { patchFileById, selectedFile } from "./files";
import { isWorkspaceInAddition, isWorkspaceSelectionOpen } from "./workspace";
import { FileHeading } from "../editorComponents/components/Heading";
import { SlashCommand } from "../editorComponents/components/Suggestions.js";
import { StandardTaskList } from "../editorComponents/components/StandardTaskList.js";
import { StandardTaskItem } from "../editorComponents/components/StandardTaskItem.js";
import { CodeSnippet } from "../editorComponents/components/CodeSnippet.js";
import { File } from "@ravenlens/shared";
import { workspaceHasActiveSubscription } from "./subscription.js";

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

    const store = {
        subscribe,
        update,
        selectFile(file: File.File.File) {
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
                        CodeSnippet
                    ],
                    onUpdate(props) {
                        if (!activeFileId) {
                            return;
                        }

                        patchFileById(activeFileId, {
                            content: props.editor.getHTML()
                        });
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
        }
    });

    return store;
})();
