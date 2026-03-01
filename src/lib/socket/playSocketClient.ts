import { io, type Socket } from "socket.io-client";
import {
    PLAY_SOCKET_EVENTS,
    PLAY_SOCKET_NAMESPACE,
    type PlayFileState,
    type PlayStartRequestPayload,
    type PlayStateRequestPayload,
    type PlayStopRequestPayload
} from "./playSocketProtocol";

const SOCKET_PATH = "/socket.io";
const DEFAULT_ACK_TIMEOUT_MS = 5_000;

let playSocket: Socket | undefined;

function getSocketBaseUrl() {
    if (typeof window === "undefined") {
        return "";
    }

    return import.meta.env.VITE_PLAY_SOCKET_URL || window.location.origin;
}

function getPlaySocket() {
    if (playSocket) {
        return playSocket;
    }

    playSocket = io(`${getSocketBaseUrl()}${PLAY_SOCKET_NAMESPACE}`, {
        path: SOCKET_PATH,
        transports: ["websocket"]
    });

    return playSocket;
}

function emitWithAck<TResponse>(eventName: string, payload: unknown): Promise<TResponse> {
    return new Promise((resolve, reject) => {
        const socket = getPlaySocket();

        socket.timeout(DEFAULT_ACK_TIMEOUT_MS).emit(eventName, payload, (error: Error | null, response: TResponse) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(response);
        });
    });
}

export async function getFilePlayState(fileId: string) {
    const payload: PlayStateRequestPayload = { fileId };
    return emitWithAck<PlayFileState>(PLAY_SOCKET_EVENTS.getState, payload);
}

export async function startFilePlay(payload: PlayStartRequestPayload) {
    return emitWithAck<PlayFileState>(PLAY_SOCKET_EVENTS.start, payload);
}

export async function stopFilePlay(payload: PlayStopRequestPayload) {
    return emitWithAck<PlayFileState>(PLAY_SOCKET_EVENTS.stop, payload);
}

export function subscribeToFilePlayState(fileId: string, onStateChanged: (state: PlayFileState) => void) {
    const socket = getPlaySocket();

    const listener = (state: PlayFileState) => {
        if (state.fileId !== fileId) {
            return;
        }

        onStateChanged(state);
    };

    socket.on(PLAY_SOCKET_EVENTS.state, listener);

    void emitWithAck<PlayFileState>(PLAY_SOCKET_EVENTS.subscribe, { fileId })
        .then(onStateChanged)
        .catch(() => {});

    return () => {
        socket.off(PLAY_SOCKET_EVENTS.state, listener);

        void emitWithAck<PlayFileState>(PLAY_SOCKET_EVENTS.unsubscribe, { fileId }).catch(() => {});
    };
}
