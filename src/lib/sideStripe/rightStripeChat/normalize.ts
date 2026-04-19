import type { AIChatDecision, AIChatMode } from "@ravenlens/shared/chat-ai/frontend";
import type {
    MermaidDiagramType,
    FileChatMode,
    PersistedChatBubble as AIChatBubble,
    PersistedChatResponse as AIChatResponse,
    PersistedChatThread as AIChatThread,
    PersistedSelectedTextRange as SelectedTextRange
} from "../../../routes/(app)/files/api/server-utils";

export function normalizeWorkspaceId(workspaceIdCandidate: unknown): string | undefined {
    if (typeof workspaceIdCandidate !== "string") {
        return undefined;
    }

    const normalizedWorkspaceId = workspaceIdCandidate.trim();
    return normalizedWorkspaceId.length ? normalizedWorkspaceId : undefined;
}

export function normalizeText(valueCandidate: unknown): string {
    if (typeof valueCandidate !== "string") {
        return "";
    }

    return valueCandidate;
}

export function normalizeAIChatMode(modeCandidate: unknown): FileChatMode {
    if (modeCandidate === "regular-ask") {
        return modeCandidate;
    }

    return "regular-ask";
}

export function normalizeMermaidType(typeCandidate: unknown): MermaidDiagramType {
    if (
        typeCandidate === "flowchart"
        || typeCandidate === "sequenceDiagram"
        || typeCandidate === "classDiagram"
        || typeCandidate === "stateDiagram-v2"
    ) {
        return typeCandidate;
    }

    return "flowchart";
}

export function normalizeDecision(decisionCandidate: unknown): AIChatDecision | undefined {
    if (decisionCandidate === "accepted" || decisionCandidate === "declined") {
        return decisionCandidate;
    }

    return undefined;
}

export function toIsoDateString(dateCandidate: unknown): Date {
    const nextDate = new Date(typeof dateCandidate === "string" || typeof dateCandidate === "number"
        ? dateCandidate
        : Date.now());

    if (Number.isNaN(nextDate.getTime())) {
        return new Date();
    }

    return nextDate;
}

export function normalizeSelectedRange(candidate: unknown): SelectedTextRange | null {
    if (!candidate || typeof candidate !== "object") {
        return null;
    }

    const id = normalizeText((candidate as SelectedTextRange).id).trim();
    const from = Number((candidate as SelectedTextRange).from);
    const to = Number((candidate as SelectedTextRange).to);

    if (!id || !Number.isFinite(from) || !Number.isFinite(to)) {
        return null;
    }

    return {
        id,
        from,
        to,
        html: normalizeText((candidate as SelectedTextRange).html)
    };
}

export function normalizeResponse(candidate: unknown): AIChatResponse | null {
    if (!candidate || typeof candidate !== "object") {
        return null;
    }

    const id = normalizeText((candidate as AIChatResponse).id).trim();
    if (!id) {
        return null;
    }

    const mermaidCandidate = (candidate as AIChatResponse).mermaid;
    const hasMermaid = Boolean(
        mermaidCandidate
        && typeof mermaidCandidate === "object"
        && typeof mermaidCandidate.definition === "string"
        && mermaidCandidate.definition.trim().length
    );

    return {
        id,
        answerHTML: normalizeText((candidate as AIChatResponse).answerHTML),
        applyTo: (candidate as AIChatResponse).applyTo === "selection" ? "selection" : "chat",
        decision: normalizeDecision((candidate as AIChatResponse).decision),
        publishedDate: toIsoDateString((candidate as AIChatResponse).publishedDate),
        ...(hasMermaid
            ? {
                mermaid: {
                    definition: normalizeText(mermaidCandidate!.definition),
                    type: normalizeMermaidType(mermaidCandidate!.type)
                }
            }
            : {})
    };
}

export function normalizeBubble(candidate: unknown): AIChatBubble | null {
    if (!candidate || typeof candidate !== "object") {
        return null;
    }

    const bubbleId = normalizeText((candidate as AIChatBubble).id).trim();
    if (!bubbleId) {
        return null;
    }

    const selectedTextForPrompt = Array.isArray((candidate as AIChatBubble).selectedTextForPrompt)
        ? (candidate as AIChatBubble).selectedTextForPrompt
            .map(normalizeSelectedRange)
            .filter((range): range is SelectedTextRange => range !== null)
        : [];

    const aiResponse = Array.isArray((candidate as AIChatBubble).aiResponse)
        ? (candidate as AIChatBubble).aiResponse
            .map(normalizeResponse)
            .filter((response): response is AIChatResponse => response !== null)
        : [];

    return {
        id: bubbleId,
        mode: normalizeAIChatMode((candidate as AIChatBubble).mode),
        isActive: Boolean((candidate as AIChatBubble).isActive),
        decision: normalizeDecision((candidate as AIChatBubble).decision),
        userPrompt: normalizeText((candidate as AIChatBubble).userPrompt),
        userPromptHTML: normalizeText((candidate as AIChatBubble).userPromptHTML),
        selectedTextForPrompt,
        aiResponse,
        createdAt: toIsoDateString((candidate as AIChatBubble).createdAt)
    };
}

export function normalizeThread(candidate: unknown): AIChatThread | null {
    if (!candidate || typeof candidate !== "object") {
        return null;
    }

    const id = normalizeText((candidate as AIChatThread).id).trim();
    if (!id) {
        return null;
    }

    const bubbles = Array.isArray((candidate as AIChatThread).bubbles)
        ? (candidate as AIChatThread).bubbles
            .map(normalizeBubble)
            .filter((bubble): bubble is AIChatBubble => bubble !== null)
        : [];

    return {
        id,
        title: normalizeText((candidate as AIChatThread).title).trim() || "New chat",
        type: normalizeAIChatMode((candidate as AIChatThread).type),
        bubbles,
        createdAt: toIsoDateString((candidate as AIChatThread).createdAt),
        updatedAt: toIsoDateString((candidate as AIChatThread).updatedAt)
    };
}

export function normalizeThreads(candidate: unknown): AIChatThread[] {
    if (!Array.isArray(candidate)) {
        return [];
    }

    return candidate
        .map(normalizeThread)
        .filter((thread): thread is AIChatThread => thread !== null);
}

export function normalizeSelectedChatId(selectedChatIdCandidate: unknown, chats: AIChatThread[]): string | undefined {
    if (typeof selectedChatIdCandidate !== "string") {
        return chats[0]?.id;
    }

    const selectedChatId = selectedChatIdCandidate.trim();
    if (!selectedChatId.length) {
        return chats[0]?.id;
    }

    const hasSelectedChat = chats.some((chat) => chat.id === selectedChatId);
    return hasSelectedChat ? selectedChatId : chats[0]?.id;
}
