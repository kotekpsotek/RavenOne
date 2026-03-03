import type { Editor } from "@tiptap/core";
import type { Range } from "@tiptap/core";

export type ElementInsertionItem = {
    name: string;
    icon: string;
    aliases?: string[];
    command: (editor: Editor, range: Range) => void;
};

export const menuElements: ElementInsertionItem[] = [
    {
        name: "AI Bullet list",
        icon: "material-symbols:auto-awesome",
        aliases: ["ai", "ai ul", "ai list", "smart bullet"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).toggleBulletList().run();
        }
    },
    {
        name: "AI Ordered list",
        icon: "material-symbols:format-list-numbered-rounded",
        aliases: ["ai", "ai ol", "ai numbered", "smart ordered"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).toggleOrderedList().run();
        }
    },
    {
        name: "AI Checkbox list",
        icon: "material-symbols:checklist-rounded",
        aliases: ["ai", "ai checklist", "ai task", "smart checkbox"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).toggleTaskList().run();
        }
    },
    {
        name: "Bullet list",
        icon: "material-symbols:format-list-bulleted-rounded",
        aliases: ["ul", "list", "standard bullet", "normal bullet"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).toggleList("standardBulletList", "standardListItem").run();
        }
    },
    {
        name: "Ordered list",
        icon: "material-symbols:format-list-numbered-rounded",
        aliases: ["ol", "numbered", "standard ordered", "normal ordered"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).toggleList("standardOrderedList", "standardListItem").run();
        }
    },
    {
        name: "Checkbox list",
        icon: "material-symbols:check-box-outline-blank-rounded",
        aliases: ["todo", "checklist", "task list", "standard checkbox", "normal checkbox"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).toggleList("standardTaskList", "standardTaskItem").run();
        }
    },
    {
        name: "Paragraph",
        icon: "material-symbols:notes-rounded",
        aliases: ["text", "p"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).setParagraph().run();
        }
    },
    {
        name: "Heading 1",
        icon: "material-symbols:looks-one-rounded",
        aliases: ["title", "h1"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
        }
    },
    {
        name: "Heading 2",
        icon: "material-symbols:looks-two-rounded",
        aliases: ["subtitle", "h2"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
        }
    },
    {
        name: "Heading 3",
        icon: "material-symbols:looks-3-rounded",
        aliases: ["section", "h3"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
        }
    },
    {
        name: "Quote",
        icon: "material-symbols:format-quote-rounded",
        aliases: ["blockquote"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).toggleBlockquote().run();
        }
    },
    {
        name: "Code snippet",
        icon: "material-symbols:code-rounded",
        aliases: ["code", "snippet", "code block"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
        }
    },
    {
        name: "Divider",
        icon: "material-symbols:horizontal-rule-rounded",
        aliases: ["hr", "line"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).setHorizontalRule().run();
        }
    }
];