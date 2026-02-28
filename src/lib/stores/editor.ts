import { createEditor } from "svelte-tiptap";
import type { Editor as SvelteEditor } from "svelte-tiptap";
import type { File } from "./files";
import { Document } from "@tiptap/extension-document";
import { Placeholder } from "@tiptap/extension-placeholder";
import { writable } from "svelte/store";
import { StarterKit } from "@tiptap/starter-kit"
import { selectedFile } from "./files";
import { isWorkspaceInAddition, isWorkspaceSelectionOpen } from "./workspace";
import { FileHeading } from "../editorComponents/components/Heading";
import { SlashCommand } from "../editorComponents/components/SlashCommand.js";

function normalizeContent(content?: string): string {
    if (!content || !content.trim()) {
        return "<p></p>";
    }

    return content;
}

export const editor = (() => {
    const { subscribe, set } = writable<SvelteEditor | undefined>(undefined);
    let currentEditor: SvelteEditor | undefined;
    let activeFileId: string | undefined;

    const store = {
        subscribe,
        selectFile(file: File) {
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
                        StarterKit,
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
                        SlashCommand,
                    ],
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
