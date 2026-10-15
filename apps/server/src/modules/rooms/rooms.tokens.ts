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

export function defaultRoomsOptions(): RoomsOptions {
  return {
    keyPrefix: 'lc:',
    publicOrigin: (process.env.PUBLIC_ORIGIN ?? 'https://zuirock.onrender.com').replace(/\/+$/, ''),
  };
}
