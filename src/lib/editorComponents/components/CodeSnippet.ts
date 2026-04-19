import CodeBlock from "@tiptap/extension-code-block";
import { SvelteNodeViewRenderer } from "svelte-tiptap";
import CodeSnippetView from "../ui/CodeSnippet.svelte";

export interface CodeSnippetNodeParams {
    /** The code snippet name */
    description?: string
    /** Code language */
    language: string
    /** Contains code for editor */
    code: string
};

export const CodeSnippet = CodeBlock.extend({
	name: "codeBlock",

	addAttributes() {
		return {
			...this.parent?.(),
			language: {
				default: "plaintext",
				parseHTML: (element) => element.getAttribute("data-language") ?? element.getAttribute("data-lang") ?? "plaintext",
				renderHTML: (attributes) => {
					if (!attributes.language) return {};
					return { "data-language": attributes.language };
				},
			},
			description: {
				default: "",
				parseHTML: (element) => element.getAttribute("data-description") ?? "",
				renderHTML: (attributes) => {
					if (!attributes.description) {
						return {};
					}

					return { "data-description": attributes.description };
				},
			},
			code: {
				default: "",
				parseHTML: (element) => element.getAttribute("data-code") ?? "",
				renderHTML: (attributes) => {
					if (!attributes.code) {
						return {};
					}

					return { "data-code": attributes.code };
				},
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: 'pre[data-type="codeSnippet"]',
				preserveWhitespace: "full",
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		return ["pre", { ...HTMLAttributes, "data-type": "codeSnippet" }, ["code", 0]];
	},

	addNodeView() {
		return SvelteNodeViewRenderer(CodeSnippetView);
	},
});
