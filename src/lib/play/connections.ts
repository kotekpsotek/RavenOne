import type { File, Play } from "@ravenlens/shared";
import io, { Socket } from "socket.io-client";
import { env } from "$env/dynamic/public";

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

    /* onPointResult(handler: (payload: PointResultEventPayload) => void) {
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
    } */
}
