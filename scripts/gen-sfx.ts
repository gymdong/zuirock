/**
 * Synthesizes the app's original sound effects and lobby BGM (docs/audio.md). Pure Node, no deps:
 * writes 16-bit PCM mono WAV files to apps/mobile/assets/sfx and apps/mobile/assets/bgm.
 *
 *   node scripts/gen-sfx.ts
 *
 * Deterministic (seeded noise), so re-running produces byte-identical files.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'mobile', 'assets');

type Wave = 'square' | 'triangle' | 'sine' | 'saw' | 'noise';
type Freq = number | ((t: number) => number);

interface NoteOpts {
  wave?: Wave;
  /** Square duty cycle (0..1). */
  duty?: number;
  vol?: number;
  attack?: number;
  release?: number;
  /** Exponential decay rate per second after attack (0 = sustain). */
  decay?: number;
  /** Vibrato depth (ratio) and rate (Hz). */
  vib?: [number, number];
}

class Track {
  readonly data: Float32Array;
  readonly rate: number;
  private seed = 1234567;
  constructor(rate: number, seconds: number) {
    this.rate = rate;
    this.data = new Float32Array(Math.round(rate * seconds));
  }

  private rand(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x3fffffff - 1;
  }

  /** Adds one note starting at `start` seconds; wraps around the end when `wrap` (seamless loops). */
  note(start: number, dur: number, freq: Freq, o: NoteOpts = {}, wrap = false): void {
    const { wave = 'square', duty = 0.5, vol = 0.3, attack = 0.004, release = 0.03, decay = 0, vib } = o;
    const n = Math.round(dur * this.rate);
    const s0 = Math.round(start * this.rate);
    let phase = 0;
    let held = 0;
    for (let i = 0; i < n; i++) {
      const t = i / this.rate;
      let f = typeof freq === 'number' ? freq : freq(t);
      if (vib) f *= 1 + vib[0] * Math.sin(2 * Math.PI * vib[1] * t);
      phase = (phase + f / this.rate) % 1;
      let v: number;
      switch (wave) {
        case 'square':
          v = phase < duty ? 1 : -1;
          break;
        case 'triangle':
          v = 4 * Math.abs(phase - 0.5) - 1;
          break;
        case 'sine':
          v = Math.sin(2 * Math.PI * phase);
          break;
        case 'saw':
          v = 2 * phase - 1;
          break;
        default:
          // Sample-and-hold noise at `f` Hz gives the 8-bit "crunch".
          if (phase < f / this.rate) held = this.rand();
          v = held;
      }
      const env = Math.min(1, t / attack) * Math.min(1, (dur - t) / release) * (decay ? Math.exp(-decay * t) : 1);
      let idx = s0 + i;
      if (idx >= this.data.length) {
        if (!wrap) break;
        idx %= this.data.length;
      }
      this.data[idx]! += v * env * vol;
    }
  }

  /** Feedback echo; `wrap` feeds the tail into the start so a loop stays seamless. */
  echo(delay: number, feedback: number, wrap = false): void {
    const d = Math.round(delay * this.rate);
    const len = this.data.length;
    const dry = this.data.slice();
    // y[i] = x[i] + fb * y[i - d]; a second lap recomputes the head with the wrapped tail as history.
    for (let k = d; k < (wrap ? 2 * len : len); k++) {
      const i = k % len;
      this.data[i] = dry[i]! + feedback * this.data[(k - d) % len]!;
    }
  }

  toWav(peak = 0.85): Buffer {
    let max = 0;
    for (const v of this.data) max = Math.max(max, Math.abs(v));
    const gain = max > 0 ? peak / max : 1;
    const bytes = this.data.length * 2;
    const buf = Buffer.alloc(44 + bytes);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + bytes, 4);
    buf.write('WAVEfmt ', 8);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20); // PCM
    buf.writeUInt16LE(1, 22); // mono
    buf.writeUInt32LE(this.rate, 24);
    buf.writeUInt32LE(this.rate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(bytes, 40);
    this.data.forEach((v, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * gain)) * 32767), 44 + i * 2));
    return buf;
  }
}

/** MIDI note → Hz. */
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const SFX_RATE = 22050;
const sfx = (seconds: number) => new Track(SFX_RATE, seconds);

const SFX: Record<string, () => Track> = {
  tap() {
    const t = sfx(0.06);
    t.note(0, 0.06, (x) => 900 + x * 6000, { duty: 0.25, vol: 0.4, decay: 40, release: 0.01 });
    return t;
  },
  correct() {
    const t = sfx(0.55);
    [72, 76, 79, 84].forEach((m, i) => {
      t.note(i * 0.07, 0.3, hz(m), { duty: 0.25, vol: 0.25, decay: 7 });
      t.note(i * 0.07, 0.3, hz(m + 12), { wave: 'triangle', vol: 0.12, decay: 8 });
    });
    t.echo(0.09, 0.25);
    return t;
  },
  wrong() {
    const t = sfx(0.4);
    t.note(0, 0.15, 196, { duty: 0.5, vol: 0.3, vib: [0.04, 30] });
    t.note(0.16, 0.24, 147, { duty: 0.5, vol: 0.3, vib: [0.04, 30], decay: 3 });
    return t;
  },
  hint() {
    const t = sfx(0.5);
    [88, 91, 95, 93, 96, 100].forEach((m, i) => t.note(i * 0.05, 0.16, hz(m), { wave: 'triangle', vol: 0.25, decay: 14 }));
    t.echo(0.07, 0.3);
    return t;
  },
  tick() {
    const t = sfx(0.05);
    t.note(0, 0.05, 1600, { wave: 'sine', vol: 0.5, decay: 90, attack: 0.001, release: 0.005 });
    t.note(0, 0.02, 8000, { wave: 'noise', vol: 0.15, decay: 150, attack: 0.001, release: 0.005 });
    return t;
  },
  questionStart() {
    const t = sfx(0.45);
    t.note(0, 0.4, (x) => 1500 + x * 14000, { wave: 'noise', vol: 0.12, attack: 0.15, release: 0.2 });
    t.note(0.02, 0.38, (x) => hz(60) * 2 ** (x * 5), { duty: 0.125, vol: 0.16, attack: 0.05, release: 0.12 });
    return t;
  },
  reveal() {
    const t = sfx(0.45);
    t.note(0, 0.1, hz(79), { duty: 0.25, vol: 0.26 });
    t.note(0.11, 0.32, hz(84), { duty: 0.25, vol: 0.26, decay: 5 });
    t.note(0.11, 0.32, hz(76), { wave: 'triangle', vol: 0.18, decay: 5 });
    return t;
  },
  victory() {
    const t = sfx(1.4);
    const seq: Array<[number, number, number]> = [
      [67, 0, 0.12], [72, 0.13, 0.12], [76, 0.26, 0.12], [79, 0.39, 0.22], [76, 0.62, 0.12], [79, 0.75, 0.6],
    ];
    seq.forEach(([m, s, d]) => {
      t.note(s, d, hz(m), { duty: 0.25, vol: 0.24, vib: d > 0.3 ? [0.006, 6] : undefined });
      t.note(s, d, hz(m - 12), { wave: 'triangle', vol: 0.22 });
    });
    t.note(0.75, 0.6, hz(48), { wave: 'triangle', vol: 0.25 });
    t.echo(0.11, 0.2);
    return t;
  },
  defeat() {
    const t = sfx(1.0);
    [[67, 0], [66, 0.18], [65, 0.36]].forEach(([m, s]) => t.note(s!, 0.17, hz(m!), { wave: 'triangle', vol: 0.3 }));
    t.note(0.54, 0.45, (x) => hz(64) * 2 ** (-x * 1.6), { duty: 0.5, vol: 0.18, vib: [0.02, 7], release: 0.15 });
    return t;
  },
  levelUp() {
    const t = sfx(0.95);
    [60, 64, 67, 72, 76, 79].forEach((m, i) => t.note(i * 0.055, 0.1, hz(m), { duty: 0.25, vol: 0.22 }));
    [84, 88, 91].forEach((m) => t.note(0.36, 0.55, hz(m), { duty: 0.125, vol: 0.13, decay: 3, vib: [0.005, 7] }));
    t.note(0.36, 0.55, hz(60), { wave: 'triangle', vol: 0.25, decay: 3 });
    t.echo(0.1, 0.25);
    return t;
  },
  chestOpen() {
    const t = sfx(0.9);
    t.note(0, 0.14, (x) => 220 + x * 400, { duty: 0.5, vol: 0.16, vib: [0.08, 40] });
    t.note(0.14, 0.05, 6000, { wave: 'noise', vol: 0.3, decay: 60 });
    [84, 88, 91, 96, 100].forEach((m, i) => t.note(0.18 + i * 0.06, 0.3, hz(m), { wave: 'triangle', vol: 0.2, decay: 9 }));
    t.echo(0.08, 0.3);
    return t;
  },
  purchase() {
    const t = sfx(0.4);
    t.note(0, 0.07, hz(83), { duty: 0.5, vol: 0.25 });
    t.note(0.07, 0.32, hz(88), { duty: 0.5, vol: 0.25, decay: 8 });
    return t;
  },
  error() {
    const t = sfx(0.32);
    t.note(0, 0.12, 330, { duty: 0.5, vol: 0.25 });
    t.note(0.16, 0.14, 262, { duty: 0.5, vol: 0.25 });
    return t;
  },
};

/** Gentle 8-bit lobby loop: 12 bars of 4/4 at 120 BPM (24 s), C–Am–F–G, echo wrapped for a seamless loop. */
function lobby(): Track {
  const BPM = 120;
  const beat = 60 / BPM;
  const bars = 12;
  const t = new Track(16000, bars * 4 * beat);
  const chords = [
    [48, 60, 64, 67], [45, 57, 60, 64], [41, 57, 60, 65], [43, 55, 59, 62],
    [48, 60, 64, 67], [45, 57, 60, 64], [41, 57, 60, 65], [43, 55, 59, 62],
    [41, 57, 60, 65], [43, 55, 59, 62], [40, 55, 59, 64], [43, 55, 59, 62],
  ];
  // Melody in eighth notes (0 = rest); C major pentatonic, two bars per line.
  const melody = [
    76, 0, 79, 76, 74, 72, 74, 0, 72, 0, 69, 72, 74, 0, 0, 0,
    72, 0, 74, 76, 79, 0, 76, 74, 74, 0, 72, 74, 67, 0, 0, 0,
    76, 0, 79, 76, 74, 72, 74, 0, 72, 0, 69, 72, 76, 0, 74, 0,
    72, 0, 69, 72, 74, 0, 76, 0, 79, 0, 76, 74, 72, 0, 0, 0,
    69, 72, 74, 0, 76, 0, 74, 72, 71, 0, 74, 0, 79, 0, 0, 0,
    76, 0, 74, 72, 71, 0, 72, 0, 74, 0, 71, 0, 67, 0, 0, 0,
  ];
  chords.forEach((ch, bar) => {
    const s = bar * 4 * beat;
    for (let b = 0; b < 4; b++) {
      t.note(s + b * beat, beat * 0.9, hz(ch[0]! - (b % 2 ? -12 : 0)), { wave: 'triangle', vol: 0.32, release: 0.06 });
      [1, 2, 3].forEach((k, j) =>
        t.note(s + b * beat + beat / 2 + j * 0.02, beat * 0.35, hz(ch[k]!), { duty: 0.125, vol: 0.05, decay: 6 }),
      );
    }
  });
  melody.forEach((m, i) => {
    if (m) t.note(i * (beat / 2), beat * 0.45, hz(m), { duty: 0.25, vol: 0.13, decay: 2.5, vib: [0.004, 5.5], release: 0.05 });
  });
  t.echo(beat * 0.75, 0.22, true);
  return t;
}

function write(dir: string, name: string, track: Track, peak?: number): number {
  const out = join(ROOT, dir, `${name}.wav`);
  mkdirSync(dirname(out), { recursive: true });
  const wav = track.toWav(peak);
  writeFileSync(out, wav);
  return wav.length;
}

let total = 0;
for (const [name, make] of Object.entries(SFX)) {
  const size = write('sfx', name, make());
  total += size;
  console.log(`sfx/${name}.wav ${(size / 1024).toFixed(1)} KB`);
}
console.log(`sfx total ${(total / 1024).toFixed(1)} KB`);
console.log(`bgm/lobby.wav ${(write('bgm', 'lobby', lobby(), 0.7) / 1024).toFixed(1)} KB`);
