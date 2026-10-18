/**
 * Sound manager over a minimal player interface (expo-audio's AudioPlayer satisfies it), so the
 * mute/volume/unlock logic is testable with a fake backend. Never throws: audio must not break UI.
 */
export const SFX_NAMES = [
  'tap', 'correct', 'wrong', 'hint', 'tick', 'questionStart', 'reveal',
  'victory', 'defeat', 'levelUp', 'chestOpen', 'purchase', 'error',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export interface PlayerLike {
  volume: number;
  loop: boolean;
  play(): void;
  pause(): void;
  seekTo(seconds: number): unknown;
}

export interface AudioSettings {
  sfxOn: boolean;
  bgmOn: boolean;
  /** Master volume 0..1. */
  volume: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { sfxOn: true, bgmOn: true, volume: 0.8 };
/** BGM plays at this fraction of the master volume (item 10: "낮은 볼륨"). */
export const BGM_GAIN = 0.25;

export interface SoundManagerDeps {
  create: (name: SfxName | 'bgm') => PlayerLike | null;
  save?: (s: AudioSettings) => void;
  /** Web needs a user gesture before audio may start; native starts unlocked. */
  locked: boolean;
}

export class SoundManager {
  private players = new Map<SfxName | 'bgm', PlayerLike | null>();
  private listeners = new Set<() => void>();
  private settings: AudioSettings = DEFAULT_AUDIO_SETTINGS;
  private unlocked: boolean;
  private bgmWanted = 0;
  private bgmPlaying = false;
  private readonly deps: SoundManagerDeps;

  constructor(deps: SoundManagerDeps) {
    this.deps = deps;
    this.unlocked = !deps.locked;
  }

  getSettings = (): AudioSettings => this.settings;
  isUnlocked = (): boolean => this.unlocked;
  isBgmPlaying = (): boolean => this.bgmPlaying;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  /** Apply stored settings without saving them back. */
  restore(s: Partial<AudioSettings> | null): void {
    if (s) this.apply({ ...this.settings, ...s }, false);
  }

  update(patch: Partial<AudioSettings>): void {
    this.apply({ ...this.settings, ...patch }, true);
  }

  preload(names: readonly SfxName[] = SFX_NAMES): void {
    names.forEach((n) => this.player(n));
  }

  /** First user gesture on web. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.syncBgm();
  }

  play(name: SfxName): void {
    const { sfxOn, volume } = this.settings;
    if (!sfxOn || !this.unlocked || volume <= 0) return;
    const p = this.player(name);
    if (!p) return;
    try {
      p.volume = volume;
      void Promise.resolve(p.seekTo(0)).catch(() => undefined);
      p.play();
    } catch {
      // ignore
    }
  }

  /** A screen that wants the lobby BGM (home, waiting room) holds it while focused. Returns release. */
  holdBgm(): () => void {
    this.bgmWanted += 1;
    this.syncBgm();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.bgmWanted -= 1;
      this.syncBgm();
    };
  }

  private apply(next: AudioSettings, save: boolean): void {
    this.settings = { ...next, volume: Math.max(0, Math.min(1, next.volume)) };
    if (save) this.deps.save?.(this.settings);
    this.syncBgm();
    this.listeners.forEach((l) => l());
  }

  private player(name: SfxName | 'bgm'): PlayerLike | null {
    if (!this.players.has(name)) {
      let p: PlayerLike | null;
      try {
        p = this.deps.create(name);
      } catch {
        p = null;
      }
      this.players.set(name, p);
    }
    return this.players.get(name) ?? null;
  }

  private syncBgm(): void {
    const { bgmOn, volume } = this.settings;
    const should = this.bgmWanted > 0 && bgmOn && this.unlocked && volume > 0;
    const p = should || this.bgmPlaying ? this.player('bgm') : null;
    if (!p) return;
    try {
      p.loop = true;
      p.volume = volume * BGM_GAIN;
      if (should && !this.bgmPlaying) p.play();
      if (!should && this.bgmPlaying) p.pause();
      this.bgmPlaying = should;
    } catch {
      // ignore
    }
  }
}
