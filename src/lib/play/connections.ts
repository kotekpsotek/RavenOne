import { browser } from "$app/environment";
import { env } from "$env/dynamic/public";
import { selectedFile } from "$lib/stores/files";
import { JWTAuth } from "$lib/utils/auth";
import type { File, Play } from "@ravenlens/shared";
import io, { Socket } from "socket.io-client";
import { writable } from "svelte/store";

export type PointResultEventPayload = {
    answer: File.FileAI.AIAnswer;
    pointId?: string;
    fileId?: string;
};

const isNonEmptyString = (value: unknown): value is string => {
    return typeof value === "string" && value.trim().length > 0;
};

const SOCKET_ACK_TIMEOUT_MS = 10_000;

type FileSocketContext = {
    workspaceId: string;
    fileId: string;
};

const resolveFileSocketContext = (file: File.File.File | undefined): FileSocketContext | undefined => {
    if (!file) {
        return undefined;
    }

    const workspaceId = file.createdByAuthorId;
    const fileId = file.id;

    if (!isNonEmptyString(workspaceId) || !isNonEmptyString(fileId)) {
        return undefined;
    }

    return {
        workspaceId,
        fileId,
    };
};

const normalizePointResultPayload = (
    payload: unknown,
    pointIdArg?: unknown,
    fileIdArg?: unknown
): PointResultEventPayload | undefined => {
    if (!payload || typeof payload !== "object") {
        return undefined;
    }

    const payloadRecord = payload as Record<string, unknown>;
    const answer = (payloadRecord.answer ?? payloadRecord.aiAnswer ?? payload) as File.FileAI.AIAnswer | undefined;
    if (answer === undefined || answer === null) {
        return undefined;
    }

    const answerRecord = typeof answer === "object" && answer !== null
        ? (answer as any as Record<string, unknown>)
        : undefined;

    const pointIdRaw = payloadRecord.pointId ?? answerRecord?.pointId ?? pointIdArg;
    const fileIdRaw = payloadRecord.fileId
        ?? payloadRecord.documentId
        ?? answerRecord?.fileId
        ?? answerRecord?.documentId
        ?? fileIdArg;

    return {
        answer,
        pointId: isNonEmptyString(pointIdRaw) ? pointIdRaw : undefined,
        fileId: isNonEmptyString(fileIdRaw) ? fileIdRaw : undefined,
    };
};

class FilePlayConnections {
    file: File.File.File | undefined = undefined;
    connection: Socket;
    private readonly pointResultListeners = new Set<(payload: PointResultEventPayload) => void>();
    
    constructor(file?: File.File.File) {
        this.file = file;
        const connectionUrl = env.PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL?.trim();
        if (!connectionUrl) {
            console.warn("PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL is not configured; play-service connection may fail.");
        }

        this.connection = io(connectionUrl, {
            transports: ["websocket", "polling"],
            auth: callback => {
                const token = JWTAuth.getToken();

                callback({
                    authorization: token ?? undefined,
                });
            },
        });

        this.connection.on("connect_error", error => {
            console.error("Play service socket connection error:", error?.message ?? error);
        });

        this.connection.on("point-result", (payload: unknown, pointIdArg?: unknown, fileIdArg?: unknown) => {
            const normalizedPayload = normalizePointResultPayload(payload, pointIdArg, fileIdArg);
            if (!normalizedPayload) {
                return;
            }

            this.notifyPointResult(normalizedPayload);
        });

        if (file) {
            this.joinFile(file);
        }
    }

    private ensureConnected() {
        if (!this.connection.connected) {
            this.connection.connect();
        }
    }

    private notifyPointResult(payload: PointResultEventPayload) {
        for (const listener of this.pointResultListeners) {
            try {
                listener(payload);
            }
            catch (error) {
                console.error("Point result listener failed:", error);
            }
        }
    }

    private emitBooleanAckEvent(eventName: "joinfile" | "leavefile", context: FileSocketContext): Promise<boolean> {
        return new Promise((resolve, reject) => {
            let isSettled = false;

            const timeoutId = setTimeout(() => {
                if (isSettled) {
                    return;
                }

                isSettled = true;
                reject(new Error(`Timed out waiting for \"${eventName}\" acknowledgement from play-service.`));
            }, SOCKET_ACK_TIMEOUT_MS);

            this.connection.emit(eventName, context.workspaceId, context.fileId, (status: unknown) => {
                if (isSettled) {
                    return;
                }

                isSettled = true;
                clearTimeout(timeoutId);
                resolve(Boolean(status));
            });
        });
    }

    private emitPlayEvent(
        context: FileSocketContext,
        playTarget: Play.PlayFile | Play.PlayPoint,
    ): Promise<{ success: boolean; result?: Play.PlayPointAnswer; reason?: string }> {
        return new Promise((resolve, reject) => {
            let isSettled = false;

            const timeoutId = setTimeout(() => {
                if (isSettled) {
                    return;
                }

                isSettled = true;
                reject(new Error("Timed out waiting for \"play\" acknowledgement from play-service."));
            }, SOCKET_ACK_TIMEOUT_MS);

            this.connection.emit(
                "play",
                context.workspaceId,
                context.fileId,
                playTarget,
                (success: unknown, result?: Play.PlayPointAnswer, reason?: unknown) => {
                    if (isSettled) {
                        return;
                    }

                    isSettled = true;
                    clearTimeout(timeoutId);
                    resolve({
                        success: success === true,
                        result,
                        reason: isNonEmptyString(reason) ? reason : undefined,
                    });
                }
            );
        });
    }

    private emitStopEvent(context: FileSocketContext, pointId: string): Promise<{ success: boolean; reason?: string }> {
        return new Promise((resolve, reject) => {
            let isSettled = false;

            const timeoutId = setTimeout(() => {
                if (isSettled) {
                    return;
                }

                isSettled = true;
                reject(new Error("Timed out waiting for \"stop\" acknowledgement from play-service."));
            }, SOCKET_ACK_TIMEOUT_MS);

            this.connection.emit(
                "stop",
                context.workspaceId,
                context.fileId,
                pointId,
                (success: unknown, reason?: unknown) => {
                    if (isSettled) {
                        return;
                    }

                    isSettled = true;
                    clearTimeout(timeoutId);
                    resolve({
                        success: success === true,
                        reason: isNonEmptyString(reason) ? reason : undefined,
                    });
                }
            );
        });
    }

    private emitDownloadPlayingPointsEvent(context: FileSocketContext): Promise<{ success: boolean; playPoints: unknown[] }> {
        return new Promise((resolve, reject) => {
            let isSettled = false;

            const timeoutId = setTimeout(() => {
                if (isSettled) {
                    return;
                }

                isSettled = true;
                reject(new Error("Timed out waiting for \"download-playpoints\" acknowledgement from play-service."));
            }, SOCKET_ACK_TIMEOUT_MS);

            this.connection.emit(
                "download-playpoints",
                context.workspaceId,
                context.fileId,
                (success: unknown, playPoints?: unknown[]) => {
                    if (isSettled) {
                        return;
                    }

                    isSettled = true;
                    clearTimeout(timeoutId);
                    resolve({
                        success: success === true,
                        playPoints: Array.isArray(playPoints) ? playPoints : [],
                    });
                }
            );
        });
    }
    
    joinFile(file: File.File.File) {
        this.file = file;
        const context = resolveFileSocketContext(file);
        if (!context) {
            console.warn("Cannot join play-service room because file/workspace identifiers are missing.");
            return;
        }

        this.ensureConnected();

        void this.emitBooleanAckEvent("joinfile", context)
            .then(status => {
                if (!status) {
                    console.warn(`Play-service rejected room join for file \"${context.fileId}\".`);
                }
            })
            .catch(error => {
                console.error("Failed to join play-service room:", error);
            });
    }

    leaveFile() {
        if (!this.file) {
            return;
        }

        const context = resolveFileSocketContext(this.file);
        this.file = undefined;

        if (!context) {
            return;
        }

        this.ensureConnected();

        void this.emitBooleanAckEvent("leavefile", context)
            .then(status => {
                if (!status) {
                    console.warn(`Play-service rejected room leave for file \"${context.fileId}\".`);
                }
            })
            .catch(error => {
                console.error("Failed to leave play-service room:", error);
            });
    }

    /** If specified leaves old file and joins to new file */
    automateFile(file: File.File.File | undefined) {
        // Leave current file
        this.leaveFile();

        // Joins to file if specified or unsets the file if not
        if (file) {
            this.joinFile(file);    
        }
        else this.file = undefined;
    }
    
    // TODO: Return true point answer context
    async play(playTarget: Play.PlayFile | Play.PlayPoint): Promise<Play.PlayPointAnswer> {
        const context = resolveFileSocketContext(playTarget.file ?? this.file);
        if (!context) {
            throw new Error("Cannot play point without file and workspace identifiers.");
        }

        this.ensureConnected();

        const playResult = await this.emitPlayEvent(context, playTarget);
        if (!playResult.success || !playResult.result) {
            throw new Error(playResult.reason ?? "Play-service returned an empty play result.");
        }

        const normalizedPayload = normalizePointResultPayload(
            {
                answer: playResult.result,
                pointId: playTarget.pointId,
                fileId: context.fileId,
            },
            playTarget.pointId,
            context.fileId
        );

        if (normalizedPayload) {
            this.notifyPointResult(normalizedPayload);
        }

        return playResult.result;
    }

    async stop(pointId: string, file?: File.File.File): Promise<boolean> {
        const context = resolveFileSocketContext(file ?? this.file);
        if (!context) {
            throw new Error("Cannot stop point without file and workspace identifiers.");
        }

        if (!isNonEmptyString(pointId)) {
            throw new Error("Cannot stop point without a valid point identifier.");
        }

        this.ensureConnected();
        const stopResult = await this.emitStopEvent(context, pointId);

        if (!stopResult.success) {
            throw new Error(stopResult.reason ?? "Play-service refused to stop the point.");
        }

        return true;
    }

    async downloadPlayingPoints(file?: File.File.File): Promise<unknown[]> {
        const context = resolveFileSocketContext(file ?? this.file);
        if (!context) {
            throw new Error("Cannot download playing points without file and workspace identifiers.");
        }

        this.ensureConnected();
        const result = await this.emitDownloadPlayingPointsEvent(context);

        if (!result.success) {
            throw new Error("Play-service refused to provide currently playing points.");
        }

        return result.playPoints;
    }

    onPointResult(handler: (payload: PointResultEventPayload) => void) {
        this.pointResultListeners.add(handler);

        return () => {
            this.pointResultListeners.delete(handler);
        };
    }
}

export const playInFile = (() => {
    // Store
    const store = writable<FilePlayConnections | undefined>(undefined);

    // Joins to file
    if (browser) {
        selectedFile?.subscribe(sf => {
            store?.update(connection => {
                if (!connection && sf) {
                    return new FilePlayConnections(sf);
                }

                connection?.automateFile(sf);
                return connection;
            })
        });
    }

    //
    return store;
})();
