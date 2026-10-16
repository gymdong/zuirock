import { createHash } from 'node:crypto';
import type { GrowthConfig } from '@zuirock/game-rules';

/** DI tokens owned by the rooms module. Ports (XP, solve log, wrong note, streak) live in `src/ports`. */
export const ROOM_CLOCK = Symbol('RoomClock');
export const ROOM_RNG = Symbol('RoomRng');
export const ROOM_CONFIG = Symbol('RoomConfig');
export const ROOM_OPTIONS = Symbol('RoomOptions');

export interface RoomsOptions {
  /** Redis key prefix. Dev Redis is shared between lanes, so everything lives under `lc:`. */
  keyPrefix: string;
  /** Base for invite links: `${publicOrigin}/join/<code>`. */
  publicOrigin: string;
}

export type RoomConfig = GrowthConfig;

/**
 * `ROOM_KEY_PREFIX`, else `lc:<8-hex hash of the DATABASE_URL database name>:` so servers on different
 * databases sharing one Redis never touch each other's rooms or pending results.
 */
export function roomKeyPrefix(env: NodeJS.ProcessEnv = process.env): string {
  if (env.ROOM_KEY_PREFIX) return env.ROOM_KEY_PREFIX;
  let db: string;
  try {
    db = new URL(env.DATABASE_URL ?? '').pathname.replace(/^\//, '');
  } catch {
    db = '';
  }
  return `lc:${createHash('sha256').update(db).digest('hex').slice(0, 8)}:`;
}

export function defaultRoomsOptions(): RoomsOptions {
  return {
    keyPrefix: roomKeyPrefix(),
    publicOrigin: (process.env.PUBLIC_ORIGIN ?? 'https://zuirock.onrender.com').replace(/\/+$/, ''),
  };
}
