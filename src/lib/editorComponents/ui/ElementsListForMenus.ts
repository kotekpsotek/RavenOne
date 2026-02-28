import type { Editor } from "@tiptap/core";
import type { Range } from "@tiptap/core";

export type ElementInsertionItem = {
    name: string;
    icon?: string;
    aliases?: string[];
    command: (editor: Editor, range: Range) => void;
};

export const menuElements: ElementInsertionItem[] = [
    {
        name: "Paragraph",
        icon: "¶",
        aliases: ["text", "p"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).setParagraph().run();
        }
    },
    {
        name: "Heading 1",
        icon: "H1",
        aliases: ["title", "h1"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
        }
    },
    {
        name: "Heading 2",
        icon: "H2",
        aliases: ["subtitle", "h2"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
        }
    },
    {
        name: "Heading 3",
        icon: "H3",
        aliases: ["section", "h3"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
        }
    },
    {
        name: "Bullet list",
        icon: "•",
        aliases: ["ul", "list"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).toggleBulletList().run();
        }
    },
    {
        name: "Ordered list",
        icon: "1.",
        aliases: ["ol", "numbered"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).toggleOrderedList().run();
        }
    },
    {
        name: "Task list",
        icon: "☑",
        aliases: ["todo", "checklist"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).toggleTaskList().run();
        }
    },
    {
        name: "Quote",
        icon: "❝",
        aliases: ["blockquote"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).toggleBlockquote().run();
        }
    },
    {
        name: "Code block",
        icon: "{ }",
        aliases: ["code", "snippet"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
        }
    },
    {
        name: "Divider",
        icon: "―",
        aliases: ["hr", "line"],
        command: (editor, range) => {
            editor.chain().focus().deleteRange(range).setHorizontalRule().run();
        }
    }
];