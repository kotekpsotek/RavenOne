import { mergeAttributes, Node } from "@tiptap/core";
import { SvelteNodeViewRenderer } from "svelte-tiptap";
import AmongDocumentReferenceView from "../ui/AmongDocumentReference.svelte";

export type AmongDocumentReferenceAttrs = {
    fileId?: string;
    fileName?: string;
};

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        amongDocumentReference: {
            insertAmongDocumentReference: (attrs?: AmongDocumentReferenceAttrs) => ReturnType;
        };
    }
}

export const AmongDocumentReference = Node.create({
    name: "amongDocumentReference",
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,

    addAttributes() {
        return {
            fileId: {
                default: "",
                parseHTML: (element: HTMLElement) => element.getAttribute("data-reference-file-id") ?? "",
                renderHTML: (attributes: AmongDocumentReferenceAttrs) => {
                    if (!attributes.fileId) {
                        return {};
                    }

                    return {
                        "data-reference-file-id": attributes.fileId
                    };
                }
            },
            fileName: {
                default: "",
                parseHTML: (element: HTMLElement) => element.getAttribute("data-reference-file-name") ?? "",
                renderHTML: (attributes: AmongDocumentReferenceAttrs) => {
                    if (!attributes.fileName) {
                        return {};
                    }

                    return {
                        "data-reference-file-name": attributes.fileName
                    };
                }
            }
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-type="among-document-reference"]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ["span", mergeAttributes(HTMLAttributes, { "data-type": "among-document-reference" })];
    },

    addCommands() {
        return {
            insertAmongDocumentReference:
                (attrs: AmongDocumentReferenceAttrs = {}) =>
                ({ commands }) => {
                    return commands.insertContent({
                        type: this.name,
                        attrs: {
                            fileId: attrs.fileId ?? "",
                            fileName: attrs.fileName ?? ""
                        } satisfies AmongDocumentReferenceAttrs
                    });
                }
        };
    },

    addNodeView() {
        return SvelteNodeViewRenderer(AmongDocumentReferenceView);
    }
});
