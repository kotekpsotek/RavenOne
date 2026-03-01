import { Server as SocketIOServer } from 'socket.io';
import {
	PLAY_SOCKET_EVENTS,
	PLAY_SOCKET_NAMESPACE,
	type PlayFileState,
	type PlayStartRequestPayload,
	type PlayStateRequestPayload,
	type PlayStopRequestPayload
} from '$lib/socket/playSocketProtocol';

const SOCKET_PATH = '/socket.io';

function toRoomName(fileId: string) {
	return `play:file:${fileId}`;
}

export function setupPlaySocketServer(server: any) {
	const httpServer = server.httpServer;

	if (!httpServer) {
		return;
	}

	const internalServer = server as { __playSocketServer?: SocketIOServer };
	if (internalServer.__playSocketServer) {
		return;
	}

	const io = new SocketIOServer(httpServer, {
		path: SOCKET_PATH,
		cors: {
			origin: true,
			credentials: true
		}
	});

	internalServer.__playSocketServer = io;

	const playStateByFile = new Map<string, PlayFileState>();
	const finishTimersByFile = new Map<string, ReturnType<typeof setTimeout>>();

	const getIdleState = (fileId: string): PlayFileState => {
		return {
			fileId,
			isPlaying: false,
			updatedAt: Date.now(),
			updatedBy: 'system'
		};
	};

	const setPlayState = (
		fileId: string,
		isPlaying: boolean,
		updatedBy: string,
		patch?: Partial<Pick<PlayFileState, 'itemId' | 'content' | 'metadata'>>
	) => {
		const nextState: PlayFileState = {
			fileId,
			isPlaying,
			itemId: patch?.itemId,
			content: patch?.content,
			metadata: patch?.metadata,
			updatedAt: Date.now(),
			updatedBy
		};

		playStateByFile.set(fileId, nextState);
		io.of(PLAY_SOCKET_NAMESPACE).to(toRoomName(fileId)).emit(PLAY_SOCKET_EVENTS.state, nextState);

		return nextState;
	};

	const clearFinishTimer = (fileId: string) => {
		const timer = finishTimersByFile.get(fileId);
		if (!timer) {
			return;
		}

		clearTimeout(timer);
		finishTimersByFile.delete(fileId);
	};

	io.of(PLAY_SOCKET_NAMESPACE).on('connection', (socket) => {
		socket.on(PLAY_SOCKET_EVENTS.subscribe, (payload: PlayStateRequestPayload, ack?: (state: PlayFileState) => void) => {
			const state = playStateByFile.get(payload.fileId) ?? getIdleState(payload.fileId);

			socket.join(toRoomName(payload.fileId));
			ack?.(state);
		});

		socket.on(PLAY_SOCKET_EVENTS.unsubscribe, (payload: PlayStateRequestPayload, ack?: (state: PlayFileState) => void) => {
			socket.leave(toRoomName(payload.fileId));

			const state = playStateByFile.get(payload.fileId) ?? getIdleState(payload.fileId);

			ack?.(state);
		});

		socket.on(PLAY_SOCKET_EVENTS.getState, (payload: PlayStateRequestPayload, ack?: (state: PlayFileState) => void) => {
			const state = playStateByFile.get(payload.fileId) ?? getIdleState(payload.fileId);

			ack?.(state);
		});

		socket.on(PLAY_SOCKET_EVENTS.start, (payload: PlayStartRequestPayload, ack?: (state: PlayFileState) => void) => {
			clearFinishTimer(payload.fileId);

			const startedState = setPlayState(payload.fileId, true, socket.id, {
				itemId: payload.itemId,
				content: payload.content,
				metadata: payload.metadata
			});

			const startedItemId = payload.itemId;

			const durationMs = payload.simulationDurationMs ?? 5_000;
			const finishTimer = setTimeout(() => {
				const currentState = playStateByFile.get(payload.fileId);
				if (!currentState?.isPlaying) {
					finishTimersByFile.delete(payload.fileId);
					return;
				}

				if (startedItemId && currentState.itemId && currentState.itemId !== startedItemId) {
					finishTimersByFile.delete(payload.fileId);
					return;
				}

				setPlayState(payload.fileId, false, 'system');
				finishTimersByFile.delete(payload.fileId);
			}, durationMs);

			finishTimersByFile.set(payload.fileId, finishTimer);
			ack?.(startedState);
		});

		socket.on(PLAY_SOCKET_EVENTS.stop, (payload: PlayStopRequestPayload, ack?: (state: PlayFileState) => void) => {
			const currentState = playStateByFile.get(payload.fileId);
			if (payload.itemId && currentState?.itemId && currentState.itemId !== payload.itemId) {
				ack?.(currentState);
				return;
			}

			clearFinishTimer(payload.fileId);
			const stoppedState = setPlayState(payload.fileId, false, socket.id);
			ack?.(stoppedState);
		});
	});
}
