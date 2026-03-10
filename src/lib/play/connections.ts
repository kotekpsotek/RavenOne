import { browser } from "$app/environment";
import { env } from "$env/dynamic/public";
import { selectedFile } from "$lib/stores/files";
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
    
    constructor(file?: File.File.File) {
        this.file = file;
        this.connection = io(env.PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL);

        if (file) {
            this.joinFile(file);
        }
    }
    
    joinFile(file: File.File.File) {
        this.file = file;
        this.connection.emit("join-file", file);
    }

    leaveFile() {
        if (!this.file) {
            return;
        }

        this.connection.emit("leave-file", this.file);
        this.file = undefined;
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
    
    async play(playTarget: Play.PlayFile | Play.PlayPoint) {
        if (!this.file) {
            console.warn("Cannot play out of selected file");
            return;
        }
        
        this.connection.emit("play", this.file, playTarget);
    }

    onPointResult(handler: (payload: PointResultEventPayload) => void) {
        const listener = (payload: unknown, pointIdArg?: unknown, fileIdArg?: unknown) => {
            const normalizedPayload = normalizePointResultPayload(payload, pointIdArg, fileIdArg);
            if (!normalizedPayload) {
                return;
            }

            handler(normalizedPayload);
        };

        this.connection.on("point-result", listener);

        return () => {
            this.connection.off("point-result", listener);
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
