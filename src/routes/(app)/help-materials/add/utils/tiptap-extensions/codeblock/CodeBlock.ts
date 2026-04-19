import { Node, mergeAttributes, type Attribute } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { SvelteNodeViewRenderer } from 'svelte-tiptap';

import CodeBlock from './CodeBlock.svelte';

export interface CodeBlockAttrs {
	language: string;
	code: string;
}

export const CodeBlockExtension = Node.create({
	name: 'codeBlock',

	group: 'block',
	// Leaf/atom node (content is stored in attrs.code)
    atom: true,
    draggable: true,
    inline: false,

	addAttributes() {
		return {
			language: {
				default: 'javascript'
			},
			code: {
				default: "if (name === 'name') console.log('name')"
			}
		} as Record<keyof CodeBlockAttrs, Attribute>;
	},

	parseHTML() {
		return [
			{
				tag: this.name
			}
		];
	},

	renderHTML({ node, HTMLAttributes }) {
		return [
			this.name,
			mergeAttributes(HTMLAttributes)
		];
	},

	addCommands() {
		const getSelectedCodeBlock = (state: any) => {
			const { selection } = state;
			const type = state.schema.nodes[this.name];
			if (!type) return null;

			if (selection instanceof NodeSelection && selection.node?.type === type) {
				return { pos: selection.from, node: selection.node };
			}

			for (let depth = selection.$from.depth; depth > 0; depth--) {
				const nodeAtDepth = selection.$from.node(depth);
				if (nodeAtDepth?.type === type) {
					return { pos: selection.$from.before(depth), node: nodeAtDepth };
				}
			}

			return null;
		};

		return {
			setCodeBlock:
				(attributes: Partial<CodeBlockAttrs> = {}) =>
				({ state, dispatch }) => {
					const type = state.schema.nodes[this.name];
					if (!type) return false;

					// IMPORTANT: if we pass `code: ''` (or any explicit value), it overrides
					// the schema default. Omit undefined attrs to let defaults apply.
					const attrs: Partial<CodeBlockAttrs> = {};
					if (attributes.language != null) attrs.language = attributes.language;
					if (attributes.code != null) attrs.code = attributes.code;

					const range = state.selection.$from.blockRange(state.selection.$to);
					const tr = state.tr;
					const node = type.create(attrs);

					if (range) {
						tr.replaceRangeWith(range.start, range.end, node);
					} else {
						tr.replaceSelectionWith(node);
					}

					if (dispatch) dispatch(tr.scrollIntoView());
					return true;
				},
			toggleCodeBlock:
				(attributes: Partial<CodeBlockAttrs> = {}) =>
				({ state, dispatch }) => {
					const type = state.schema.nodes[this.name];
					const paragraph = state.schema.nodes.paragraph;
					if (!type || !paragraph) return false;

					const selected = getSelectedCodeBlock(state);
					const tr = state.tr;

					// If we're already in a codeBlock, replace it with a paragraph (preserve text)
					if (selected) {
						const textValue = selected.node.attrs?.code ? String(selected.node.attrs.code) : '';
						const text = textValue ? state.schema.text(textValue) : null;
						const p = paragraph.create(null, text ? [text] : undefined);
						tr.replaceWith(selected.pos, selected.pos + selected.node.nodeSize, p);
						if (dispatch) dispatch(tr.scrollIntoView());
						return true;
					}

					// Otherwise, replace the current block with a codeBlock
					const attrs: Partial<CodeBlockAttrs> = {};
					if (attributes.language != null) attrs.language = attributes.language;
					if (attributes.code != null) attrs.code = attributes.code;

					const range = state.selection.$from.blockRange(state.selection.$to);
					const node = type.create(attrs);

					if (range) {
						tr.replaceRangeWith(range.start, range.end, node);
					} else {
						tr.replaceSelectionWith(node);
					}

					if (dispatch) dispatch(tr.scrollIntoView());
					return true;
				}
		};
	},

	addNodeView() {
		return SvelteNodeViewRenderer(CodeBlock);
	}
});
