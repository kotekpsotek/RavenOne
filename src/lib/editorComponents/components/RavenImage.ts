import { mergeAttributes } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { SvelteNodeViewRenderer } from "svelte-tiptap";
import { uploadEditorImage } from "./RavenImage.api";
import RavenImageView from "../ui/RavenImage.svelte";

type UploadState = "empty" | "uploading" | "ready" | "error";

type RavenImageAttrs = {
    src?: string;
    alt?: string;
    title?: string;
    width?: number;
    height?: number;
    objectKey?: string;
    uploadState?: UploadState;
    uploadId?: string;
    align?: ImageAlignment;
};

type ImageAlignment = "left" | "center" | "right";

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 360;
const MIN_IMAGE_WIDTH = 180;
const MAX_IMAGE_WIDTH = 1100;
const DEFAULT_ALIGNMENT: ImageAlignment = "center";

const uploadPluginKey = new PluginKey("raven-image-upload");

function asPositiveNumber(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return Math.round(value);
    }

    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
            return Math.round(parsed);
        }
    }

    return fallback;
}

function findNodePositionByUploadId(doc: ProseMirrorNode, uploadId: string): number | null {
    let foundPosition: number | null = null;

    doc.descendants((node, position) => {
        if (node.type.name === "image" && node.attrs.uploadId === uploadId) {
            foundPosition = position;
            return false;
        }

        return true;
    });

    return foundPosition;
}

function createPlaceholderAttrs(uploadId: string): RavenImageAttrs {
    return {
        src: "",
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        objectKey: "",
        uploadState: "uploading",
        uploadId
    };
}

function estimatePersistedDimensions(
    uploadedWidth: number,
    uploadedHeight: number,
    existingWidth: unknown,
    existingHeight: unknown
): { width: number; height: number } {
    const fallbackWidth = asPositiveNumber(existingWidth, DEFAULT_WIDTH);
    const fallbackHeight = asPositiveNumber(existingHeight, DEFAULT_HEIGHT);

    const sourceWidth = asPositiveNumber(uploadedWidth, 0);
    const sourceHeight = asPositiveNumber(uploadedHeight, 0);

    if (!sourceWidth || !sourceHeight) {
        return {
            width: fallbackWidth,
            height: fallbackHeight
        };
    }

    const boundedWidth = Math.min(Math.max(sourceWidth, MIN_IMAGE_WIDTH), MAX_IMAGE_WIDTH);
    const boundedHeight = Math.max(80, Math.round((boundedWidth / sourceWidth) * sourceHeight));

    return {
        width: boundedWidth,
        height: boundedHeight
    };
}

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        ravenImage: {
            insertRavenImagePlaceholder: () => ReturnType;
        };
    }
}

export const RavenImage = Image.extend({
    name: "image",

    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: DEFAULT_WIDTH,
                parseHTML: (element: HTMLElement) => asPositiveNumber(
                    element.getAttribute("data-width") ?? element.getAttribute("width"),
                    DEFAULT_WIDTH
                ),
                renderHTML: (attributes: RavenImageAttrs) => {
                    const width = asPositiveNumber(attributes.width, DEFAULT_WIDTH);
                    return {
                        width: String(width),
                        "data-width": String(width)
                    };
                }
            },
            height: {
                default: DEFAULT_HEIGHT,
                parseHTML: (element: HTMLElement) => asPositiveNumber(
                    element.getAttribute("data-height") ?? element.getAttribute("height"),
                    DEFAULT_HEIGHT
                ),
                renderHTML: (attributes: RavenImageAttrs) => {
                    const height = asPositiveNumber(attributes.height, DEFAULT_HEIGHT);
                    return {
                        height: String(height),
                        "data-height": String(height)
                    };
                }
            },
            objectKey: {
                default: "",
                parseHTML: (element: HTMLElement) => element.getAttribute("data-object-key") ?? "",
                renderHTML: (attributes: RavenImageAttrs) => {
                    if (!attributes.objectKey) {
                        return {};
                    }

                    return {
                        "data-object-key": attributes.objectKey
                    };
                }
            },
            uploadState: {
                default: "ready",
                parseHTML: (element: HTMLElement) => {
                    const value = element.getAttribute("data-upload-state") ?? "ready";
                    return value === "uploading" || value === "empty" || value === "error" ? value : "ready";
                },
                renderHTML: (attributes: RavenImageAttrs) => {
                    const uploadState = attributes.uploadState;
                    if (!uploadState || uploadState === "ready") {
                        return {};
                    }

                    return {
                        "data-upload-state": uploadState
                    };
                }
            },
            uploadId: {
                default: "",
                parseHTML: () => "",
                renderHTML: () => ({})
            },
            align: {
                default: DEFAULT_ALIGNMENT,
                parseHTML: (element: HTMLElement) => {
                    const value = element.getAttribute("data-align") ?? DEFAULT_ALIGNMENT;
                    return value === "left" || value === "center" || value === "right"
                        ? value
                        : DEFAULT_ALIGNMENT;
                },
                renderHTML: (attributes: RavenImageAttrs) => {
                    const align = attributes.align === "left" || attributes.align === "center" || attributes.align === "right"
                        ? attributes.align
                        : DEFAULT_ALIGNMENT;

                    return {
                        "data-align": align,
                        style: `display: block; margin-left: ${align === "right" ? "auto" : align === "center" ? "auto" : "0"}; margin-right: ${align === "left" ? "auto" : align === "center" ? "auto" : "0"};`
                    };
                }
            }
        };
    },

    parseHTML() {
        return [
            {
                tag: 'img[data-type="raven-image"]'
            },
            {
                tag: "img[src]"
            }
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["img", mergeAttributes(HTMLAttributes, { "data-type": "raven-image" })];
    },

    addCommands() {
        return {
            insertRavenImagePlaceholder:
                () =>
                ({ commands }) => {
                    return commands.insertContent({
                        type: this.name,
                        attrs: {
                            src: "",
                            width: DEFAULT_WIDTH,
                            height: DEFAULT_HEIGHT,
                            objectKey: "",
                            uploadState: "empty"
                        } satisfies RavenImageAttrs
                    });
                }
        };
    },

    addNodeView() {
        return SvelteNodeViewRenderer(RavenImageView);
    },

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: uploadPluginKey,
                props: {
                    handlePaste: (view, event) => {
                        const clipboardFiles = Array.from(event.clipboardData?.files ?? []);
                        const pastedImages = clipboardFiles.filter((file) => file.type.startsWith("image/"));

                        if (!pastedImages.length) {
                            return false;
                        }

                        event.preventDefault();

                        const imageNodeType = this.editor.schema.nodes[this.name];
                        if (!imageNodeType) {
                            return false;
                        }

                        for (const imageFile of pastedImages) {
                            const uploadId = crypto.randomUUID();
                            const placeholderNode = imageNodeType.create(createPlaceholderAttrs(uploadId));
                            const paragraphNode = view.state.schema.nodes.paragraph?.create();

                            const insertedNodes = paragraphNode ? [placeholderNode, paragraphNode] : [placeholderNode];
                            const insertionTr = view.state.tr
                                .replaceSelection(new Slice(Fragment.fromArray(insertedNodes), 0, 0))
                                .scrollIntoView();

                            view.dispatch(insertionTr);

                            void (async () => {
                                try {
                                    const uploaded = await uploadEditorImage(imageFile);
                                    const position = findNodePositionByUploadId(view.state.doc, uploadId);
                                    if (position === null) {
                                        return;
                                    }

                                    const currentNode = view.state.doc.nodeAt(position);
                                    if (!currentNode) {
                                        return;
                                    }

                                    const dimensions = estimatePersistedDimensions(
                                        uploaded.width,
                                        uploaded.height,
                                        currentNode.attrs.width,
                                        currentNode.attrs.height
                                    );

                                    const updateTr = view.state.tr.setNodeMarkup(position, undefined, {
                                        ...currentNode.attrs,
                                        src: uploaded.imageUrl,
                                        objectKey: uploaded.objectKey,
                                        width: dimensions.width,
                                        height: dimensions.height,
                                        uploadState: "ready",
                                        uploadId: ""
                                    } satisfies RavenImageAttrs);

                                    view.dispatch(updateTr);
                                } catch (error) {
                                    const position = findNodePositionByUploadId(view.state.doc, uploadId);
                                    if (position === null) {
                                        return;
                                    }

                                    const currentNode = view.state.doc.nodeAt(position);
                                    if (!currentNode) {
                                        return;
                                    }

                                    const updateTr = view.state.tr.setNodeMarkup(position, undefined, {
                                        ...currentNode.attrs,
                                        uploadState: "error"
                                    } satisfies RavenImageAttrs);

                                    view.dispatch(updateTr);
                                    console.error("Failed to upload pasted image", error);
                                }
                            })();
                        }

                        return true;
                    }
                }
            })
        ];
    }
});
