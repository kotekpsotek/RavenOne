import { Mark, mergeAttributes } from "@tiptap/core";

function decodeHtmlEntities(str: string): string {
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
}

export function normalizeLinkValue(value: string | null) {
    if (!value) return null;
    const replaced = value.replace(/\\"/g, '"');
    const decoded = decodeHtmlEntities(replaced);
    return decoded.trim().replace(/^['"]+|['"]+$/g, "");
}

export function normalizeLinkRel(rel: string | null, target: string | null) {
    const normalizedTarget = normalizeLinkValue(target);
    const normalizedRel = normalizeLinkValue(rel);

    if (normalizedTarget !== "_blank") {
        return normalizedRel;
    }

    const relValues = (normalizedRel ?? "").split(/\s+/).filter(Boolean);

    for (const relValue of ["noopener", "noreferrer", "nofollow"]) {
        if (!relValues.includes(relValue)) {
            relValues.push(relValue);
        }
    }

    return relValues.join(" ");
}

export const Link = Mark.create({
    name: "link",
    inclusive: false,
    priority: 1_000,
    addAttributes() {
        return {
            href: {
                default: null,
                parseHTML: element => normalizeLinkValue(element.getAttribute("href"))
            },
            target: {
                default: null,
                parseHTML: element => normalizeLinkValue(element.getAttribute("target"))
            },
            rel: {
                default: null,
                parseHTML: element => normalizeLinkRel(element.getAttribute("rel"), element.getAttribute("target"))
            }
        };
    },
    parseHTML() {
        return [{ tag: "a[href]" }];
    },
    renderHTML({ HTMLAttributes }) {
        return [
            "a",
            mergeAttributes(
                {
                    class: "text-sky-500 underline underline-offset-2 decoration-sky-500/50 transition hover:text-sky-400"
                },
                HTMLAttributes
            ),
            0
        ];
    }
});