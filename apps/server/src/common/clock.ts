/** Server clock for REST rules (KST days, decay windows, cleanup). Tests bind a fake. */
export interface Clock {
  now(): number;
}

export const CLOCK = Symbol('Clock');

export const systemClock: Clock = { now: () => Date.now() };
