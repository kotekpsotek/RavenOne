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
