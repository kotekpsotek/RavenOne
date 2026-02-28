import { mergeAttributes, Node } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { SvelteNodeViewRenderer } from "svelte-tiptap";
// @ts-ignore - resolved by Svelte tooling
import HeadingView from "../ui/Heading.svelte";

export const FileHeading = Node.create({
	name: "fileHeading",
	group: "fileHeadingOnly",
	content: "text*",
	defining: true,

	addAttributes() {
		return {
			icon: {
				default: ""
			},
			walper: {
				default: ""
			}
		};
	},

	parseHTML() {
		return [{ tag: "file-heading" }];
	},

	renderHTML({ HTMLAttributes }) {
		return ["file-heading", mergeAttributes(HTMLAttributes), 0];
	},

	addKeyboardShortcuts() {
		return {
			Enter: () => {
				const { state, dispatch } = this.editor.view;
				const { selection, schema } = state;
				const { $from } = selection;

				if ($from.parent.type.name !== this.name) {
					return false;
				}

				const insertAt = $from.end();
				const paragraph = schema.nodes.paragraph.create();
				const tr = state.tr.insert(insertAt, paragraph);
				tr.setSelection(TextSelection.create(tr.doc, insertAt + 2));

				dispatch(tr.scrollIntoView());
				return true;
			},

			Backspace: () => {
				const { state, dispatch } = this.editor.view;
				const { selection, doc } = state;

				if (!selection.empty) {
					return false;
				}

				const { $from } = selection;
				const firstNode = doc.firstChild;

				if (!firstNode || firstNode.type.name !== this.name) {
					return false;
				}

				const isAtStartOfCurrentNode = $from.parentOffset === 0;
				if (!isAtStartOfCurrentNode) {
					return false;
				}

				const isInFirstNodeAfterHeading = $from.index(0) === 1;
				if (!isInFirstNodeAfterHeading) {
					return false;
				}

				const isAtTopLevelNodeStart = $from.depth >= 1 && $from.pos === $from.start(1);
				if (!isAtTopLevelNodeStart) {
					return false;
				}

				const headingTextEndPos = firstNode.content.size + 1;
				const tr = state.tr.setSelection(TextSelection.create(doc, headingTextEndPos));
				dispatch(tr.scrollIntoView());
				return true;
			}
		};
	},

	addNodeView() {
		return SvelteNodeViewRenderer(HeadingView);
	}
});
