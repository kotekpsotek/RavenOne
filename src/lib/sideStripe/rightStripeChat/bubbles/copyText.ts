export function htmlToPlainText(html: string): string {
    const parsedDocument = new DOMParser().parseFromString(html, "text/html");
    return (parsedDocument.body.textContent ?? "").replaceAll("\u00a0", " ");
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    }
    catch {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";

        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);

        return copied;
    }
}