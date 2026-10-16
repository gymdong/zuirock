import { ROOM_NAMESPACE } from '@zuirock/shared';
import { io } from 'socket.io-client';
import { publicOrigin, useMockApi } from '../lib/config';

/** Minimal socket surface used by the room store (socket.io-client or the in-app mock). */
export interface RoomSocket {
  on(event: string, fn: (payload: never) => void): void;
  off(event: string, fn?: (payload: never) => void): void;
  emit(event: string, payload: unknown, ack: (res: never) => void): void;
  disconnect(): void;
  readonly connected: boolean;
}

/**
 * Reconnect policy: retry forever; back off up to 60 s so a sleeping free-tier instance (cold start
 * ≈ 30–50 s) is not hammered, while still reconnecting soon after it is up. On every reconnect
 * the store calls `room:resume` for a full snapshot.
 */
export const RECONNECT_OPTIONS = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 60_000,
  randomizationFactor: 0.5,
  timeout: 20_000,
} as const;

let mockFactory: ((token: string) => RoomSocket) | null = null;
export function setMockSocketFactory(f: (token: string) => RoomSocket) {
  mockFactory = f;
}

export function createRoomSocket(token: string): RoomSocket {
  if (useMockApi && mockFactory) return mockFactory(token);
  return io(`${publicOrigin}${ROOM_NAMESPACE}`, {
    transports: ['websocket'],
    auth: { token },
    ...RECONNECT_OPTIONS,
  }) as unknown as RoomSocket;
}
