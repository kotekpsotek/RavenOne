import type { MessageUserPrompt } from "@ravenlens/shared/chat-ai/backend/schema";

export function getTime(time: MessageUserPrompt["time"]) {
    if (!time?.startAt) {
        return "0ms";
    }

    const timeStart = new Date(time.startAt).getTime();
    const rawEnd = time.endAt ?? Date.now();
    const timeEnd = new Date(rawEnd).getTime();

    if (Number.isNaN(timeStart) || Number.isNaN(timeEnd)) {
        return "0ms";
    }

    const diff = Math.abs(timeEnd - timeStart);

    if (diff < 1000) {
        return `${diff}ms`;
    }

    const seconds = Math.floor((diff / 1000) % 60);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    const parts: string[] = [];

    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(" ");
}
