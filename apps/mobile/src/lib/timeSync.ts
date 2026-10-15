/**
 * Server clock estimate. All battle timers render from server time (`deadlineAt`, `serverNow` are
 * server EpochMs). Offset comes from `time:ping` round trips (NTP style, lowest-RTT sample wins);
 * before the first ping, `serverNow` on received events gives a coarse estimate.
 */
export interface TimeSample {
  offset: number;
  rtt: number;
}

export class TimeSync {
  private best: TimeSample | null = null;
  private coarseOffset: number | null = null;

  constructor(private readonly clock: () => number = Date.now) {}

  /** Record a ping: client send time, server time from the ack, client receive time. */
  addPing(clientSentAt: number, serverNow: number, clientReceivedAt: number): TimeSample {
    const rtt = Math.max(0, clientReceivedAt - clientSentAt);
    const sample = { offset: serverNow - (clientSentAt + rtt / 2), rtt };
    if (!this.best || sample.rtt <= this.best.rtt) this.best = sample;
    return sample;
  }

  /** Coarse update from an event's `serverNow` (ignores latency). Used only until a ping lands. */
  observe(serverNow: number, receivedAt: number = this.clock()): void {
    if (this.best) return;
    this.coarseOffset = serverNow - receivedAt;
  }

  get offset(): number {
    return this.best?.offset ?? this.coarseOffset ?? 0;
  }

  get synced(): boolean {
    return this.best !== null;
  }

  /** Current server time estimate. */
  now(): number {
    return this.clock() + this.offset;
  }

  /** Whole seconds left until `deadline` (server ms), never negative; ceil so "1초" shows until 0. */
  secondsLeft(deadline: number): number {
    return Math.max(0, Math.ceil((deadline - this.now()) / 1000));
  }

  reset(): void {
    this.best = null;
    this.coarseOffset = null;
  }
}

/** Run `count` pings through `ping` (returns server time) and feed the samples. */
export async function syncClock(
  sync: TimeSync,
  ping: (clientSentAt: number) => Promise<number>,
  count = 3,
  clock: () => number = Date.now,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    const sent = clock();
    try {
      const serverNow = await ping(sent);
      sync.addPing(sent, serverNow, clock());
    } catch {
      // A lost ping just leaves the previous estimate in place.
    }
  }
}
