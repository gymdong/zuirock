/**
 * Server clock for all room deadlines and scores (AC-M5). Game timers go through it so tests can
 * drive time with a fake; lease renewal and recovery scans use real intervals (they guard Redis TTLs).
 */
export interface Clock {
  now(): number;
  setTimer(fn: () => void | Promise<void>, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  setTimer(fn: () => void | Promise<void>, delayMs: number): unknown {
    return setTimeout(() => void fn(), Math.max(0, delayMs));
  }

  clearTimer(handle: unknown): void {
    clearTimeout(handle as NodeJS.Timeout);
  }
}
