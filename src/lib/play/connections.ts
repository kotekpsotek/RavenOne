import type { File } from "@ravenlens/shared";
import io, { Socket } from "socket.io-client";
import { env } from "$env/dynamic/public";
import { browser } from "$app/environment";
import { JWTAuth } from "$lib/utils/auth";
import { selectedFile } from "$lib/stores/files";
import { liveExecutionResultsStore, playingFilesAndTasksListStore } from "$lib/stores/lists";
import { userProfile } from "$lib/stores/user";
import { get, writable } from "svelte/store";

function createSocketOptions() {
    const token = JWTAuth.getToken();

    return {
        ...(token ? {
            auth: {
                token
            },
            transportOptions: {
                polling: {
                    extraHeaders: {
                        authorization: `Bearer ${token}`
                    }
                }
            }
        } : {})
    };
}

class FilePlayConnections {
    file: File.File.File | undefined = undefined;
    connection: Socket;
    
    constructor(file?: File.File.File) {
        this.file = file;
        this.connection = io(env.PUBLIC_SOCKET_IO_PLAY_CONNECTION_URL, createSocketOptions());

        if (file) {
            this.emitJoinFile(file);
        }
    }
    
    emitJoinFile(file: File.File.File) {
        this.file = file;
        this.connection.emit("join-file", file);
    }

    emitLeaveFile() {
        if (!this.file) {
            return;
        }

        this.connection.emit("leave-file", this.file);
        this.file = undefined;
    }

    /** If specified leaves old file and joins to new file */
    automateFile(file: File.File.File | undefined) {
        // Leave current file
        this.emitLeaveFile();

        // Joins to file if specified or unsets the file if not
        if (file) {
            this.emitJoinFile(file);    
        }
        else this.file = undefined;
    }

    /** 
     * Sends playing to other members to streamline results to other members
     * Returns play state
    */
    emitPlayFile(fileId: string): Promise<boolean> {
        return new Promise(res => {
            this.connection.emit("play-file", fileId, (success: boolean) => res(success));
        });
    }
    
    /** Downloads whether file is playing. Returns user is playing the file */
    emitDownloadFileState(fileId: string): Promise<string | undefined> {
        return new Promise(res => {
            this.connection.emit("download-file-state", fileId, (userId: string | undefined) => res(userId));
        });
    }

    /** Emitted once file starts playing */
    onFilePlayStart(handler: (fileId: string, userTriggeredPlayId: string) => void | Promise<void>) {
        this.connection.on("file-play-start", handler);
    }

    offFilePlayStart(handler: (fileId: string, userTriggeredPlayId: string) => void | Promise<void>) {
        this.connection.off("file-play-start", handler);
    }

    /** Emitted once file stops playing -> gives the result of file playing as documents */
    onFilePlayEnd(handler: (fileId: string, userTriggeredPlayId: string, result: File.RoutinesSpikes.FrontendDownloadResultObject) => void | Promise<void>) {
        this.connection.on("file-play-end", handler);
    }

    offFilePlayEnd(handler: (fileId: string, userTriggeredPlayId: string, result: File.RoutinesSpikes.FrontendDownloadResultObject) => void | Promise<void>) {
        this.connection.off("file-play-end", handler);
    }

    disconnect() {
        this.emitLeaveFile();
        this.connection.disconnect();
    }
}

export const FilePlayConnectionStore = (() => {
    const store = writable<FilePlayConnections | undefined>(undefined);

    let isStarted = false;
    let selectedFileUnsubscribe: (() => void) | undefined;
    let currentJoinedFileId: string | undefined;
    let currentSyncRequestId = 0;
    let playStartHandler: ((fileId: string, userTriggeredPlayId: string) => void | Promise<void>) | undefined;
    let playEndHandler: ((fileId: string, userTriggeredPlayId: string, result: File.RoutinesSpikes.FrontendDownloadResultObject) => void | Promise<void>) | undefined;

    function getOrCreateConnection(): FilePlayConnections {
        const existingConnection = get(store);
        if (existingConnection) {
            return existingConnection;
        }

        const nextConnection = new FilePlayConnections();
        store.set(nextConnection);

        return nextConnection;
    }

    async function syncSelectedFile(file: File.File.File | undefined): Promise<void> {
        if (!browser) {
            return;
        }

        const nextFileId = file?.id;
        if (nextFileId === currentJoinedFileId) {
            return;
        }

        const connection = getOrCreateConnection();
        connection.automateFile(file);
        currentJoinedFileId = nextFileId;

        if (!nextFileId) {
            return;
        }

        const syncRequestId = ++currentSyncRequestId;

        try {
            const playByUserId = await connection.emitDownloadFileState(nextFileId);

            // Ignore stale responses from previous selected-file changes.
            if (syncRequestId !== currentSyncRequestId || currentJoinedFileId !== nextFileId) {
                return;
            }

            playingFilesAndTasksListStore.syncFilePlayingState(nextFileId, playByUserId);
        }
        catch (error) {
            console.error("Cannot sync selected file play state", error);
        }
    }

    function start(): () => void {
        if (!browser) {
            return () => {};
        }

        if (isStarted) {
            return stop;
        }

        const connection = getOrCreateConnection();

        playStartHandler = (fileId: string, userTriggeredPlayId: string) => {
            playingFilesAndTasksListStore.setFilePlaying(fileId, userTriggeredPlayId);
        };

        playEndHandler = (fileId: string, _userTriggeredPlayId: string, result: File.RoutinesSpikes.FrontendDownloadResultObject) => {
            playingFilesAndTasksListStore.clearFilePlaying(fileId);
            liveExecutionResultsStore.addResult(fileId, result);
        };

        connection.onFilePlayStart(playStartHandler);
        connection.onFilePlayEnd(playEndHandler);

        selectedFileUnsubscribe = selectedFile.subscribe((file) => {
            void syncSelectedFile(file);
        });

        isStarted = true;
        return stop;
    }

    function stop() {
        if (!isStarted) {
            return;
        }

        selectedFileUnsubscribe?.();
        selectedFileUnsubscribe = undefined;
        currentSyncRequestId += 1;
        currentJoinedFileId = undefined;

        const connection = get(store);

        if (connection && playStartHandler) {
            connection.offFilePlayStart(playStartHandler);
        }

        if (connection && playEndHandler) {
            connection.offFilePlayEnd(playEndHandler);
        }

        playStartHandler = undefined;
        playEndHandler = undefined;
        isStarted = false;
    }

    async function playFile(fileId: string): Promise<boolean> {
        if (!browser || !fileId) {
            return false;
        }

        start();
        const connection = getOrCreateConnection();

        try {
            const isStartedPlaying = await connection.emitPlayFile(fileId);

            if (isStartedPlaying) {
                const currentUserId = get(userProfile)?.id;
                if (currentUserId) {
                    playingFilesAndTasksListStore.setFilePlaying(fileId, currentUserId);
                }
            }

            return isStartedPlaying;
        }
        catch (error) {
            console.error("Cannot start file playing", error);
            return false;
        }
    }

    function disconnect() {
        stop();

        const connection = get(store);
        connection?.disconnect();
        store.set(undefined);
    }

    return {
        ...store,
        start,
        stop,
        playFile,
        disconnect
    };
})();
