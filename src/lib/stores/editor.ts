import { createEditor, type Editor } from "svelte-tiptap";
import type { File } from "./files";
import { writable } from "svelte/store";
import { StarterKit } from "@tiptap/starter-kit"
import { selectedFile } from "./files";
import { isWorkspaceInAddition, isWorkspaceSelectionOpen } from "./workspace";

export const editor = (() => {
    const { subscribe, set } = writable<Editor | undefined>(undefined);
    let currentEditor: Editor | undefined;

    const store = {
        subscribe,
        selectFile(file: File) {
            const content = file.content || "xe";
            
            //
            isWorkspaceSelectionOpen.set(false);
            isWorkspaceInAddition.set(false);
            
            //
            if (!currentEditor) {
                const editorStore = createEditor({
                    content,
                    extensions: [
                        StarterKit
                    ]
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
        if (file) {
            store.selectFile(file);
        }
    });

    return store;
})();
