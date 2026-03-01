export const PLAY_SOCKET_NAMESPACE = "/play";

export const PLAY_SOCKET_EVENTS = {
    subscribe: "play:file:subscribe",
    unsubscribe: "play:file:unsubscribe",
    getState: "play:file:get-state",
    start: "play:file:start",
    stop: "play:file:stop",
    state: "play:file:state"
} as const;

export interface PlayFileState {
    fileId: string;
    isPlaying: boolean;
    updatedAt: number;
    updatedBy: string;
}

export interface PlayStateRequestPayload {
    fileId: string;
}

export interface PlayStartRequestPayload {
    fileId: string;
    itemId?: string;
    simulationDurationMs?: number;
    metadata?: Record<string, unknown>;
}

export interface PlayStopRequestPayload {
    fileId: string;
}
