import { describe, expect, it } from 'vitest';
import { SoundManager, type PlayerLike, type SfxName } from '../src/audio/manager';
import { checkPurchase, kstDay, mergeRewards, kstMonth, monthGrid, rewardLabel, shiftMonth, withFirstChar } from '../src/features/economy/logic';

describe('streak calendar', () => {
  it('uses KST dates around UTC midnight', () => {
    expect(kstDay(new Date('2026-10-31T14:59:59Z'))).toBe('2026-10-31');
    expect(kstDay(new Date('2026-10-31T15:00:00Z'))).toBe('2026-11-01');
    expect(kstMonth(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01');
  });
  it('shifts months across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', -22)).toBe('2024-12');
  });
  it('lays out a Sunday-first grid with padding', () => {
    // 2026-10-01 is a Thursday; October has 31 days → 4 leading blanks, 5 weeks.
    const g = monthGrid('2026-10', [{ date: '2026-10-02', state: 'studied' }], '2026-10-18');
    expect(g).toHaveLength(5);
    expect(g[0]!.slice(0, 4)).toEqual([null, null, null, null]);
    expect(g[0]![4]).toEqual({ date: '2026-10-01', day: 1, state: 'missed' });
    expect(g[0]![5]!.state).toBe('studied');
    expect(g.flat().find((c) => c?.day === 18)!.state).toBe('today');
    expect(g.flat().find((c) => c?.day === 19)!.state).toBe('future');
    expect(g[4]![6]!.day).toBe(31);
    expect(monthGrid('2026-11', [], '2026-10-18')[4]![2]).toBeNull();
  });
  it('handles February in leap and common years', () => {
    expect(monthGrid('2028-02', [], '2000-01-01').flat().filter(Boolean)).toHaveLength(29);
    // 2026-02-01 is a Sunday and February has 28 days → exactly 4 full weeks.
    const g = monthGrid('2026-02', [], '2000-01-01');
    expect(g).toHaveLength(4);
    expect(g[0]![0]!.day).toBe(1);
  });
});

describe('shop logic', () => {
  const item = { price: 15, owned: 0, max: 99 };
  it('checks affordability and the holding cap', () => {
    expect(checkPurchase(item, 15)).toEqual({ ok: true, cost: 15 });
    expect(checkPurchase(item, 14)).toEqual({ ok: false, reason: 'cheese', shortfall: 1 });
    expect(checkPurchase({ price: 50, owned: 2, max: 2 }, 999)).toEqual({ ok: false, reason: 'max' });
    expect(checkPurchase(item, 40, 3)).toEqual({ ok: false, reason: 'cheese', shortfall: 5 });
  });
  it('merges cheese entries into one total and keeps items', () => {
    expect(mergeRewards([{ type: 'cheese', amount: 25 }, { type: 'item', kind: 'chosung_first', quantity: 1 }, { type: 'cheese', amount: 30 }])).toEqual([
      { type: 'cheese', amount: 55 },
      { type: 'item', kind: 'chosung_first', quantity: 1 },
    ]);
    expect(mergeRewards([{ type: 'protection' }])).toEqual([{ type: 'protection' }]);
  });
  it('labels rewards and reveals the first syllable', () => {
    expect(rewardLabel({ type: 'cheese', amount: 12 })).toBe('치즈 12');
    expect(rewardLabel({ type: 'item', kind: 'remove_wrong_choice', quantity: 1 })).toBe('오답 보기 제거권');
    expect(withFirstChar('ㄱ ㅊㅈ', '고')).toBe('고ㅊㅈ');
    expect(withFirstChar(null, '고')).toBe('고');
    expect(withFirstChar('ㄱㅊ', undefined)).toBe('ㄱㅊ');
  });
});

describe('SoundManager', () => {
  const setup = (locked: boolean) => {
    const log: string[] = [];
    const players = new Map<string, PlayerLike>();
    const saved: unknown[] = [];
    const m = new SoundManager({
      locked,
      save: (s) => saved.push(s),
      create: (name: SfxName | 'bgm') => {
        const p: PlayerLike = { volume: 1, loop: false, play: () => log.push(`play:${name}@${p.volume}`), pause: () => log.push(`pause:${name}`), seekTo: () => undefined };
        players.set(name, p);
        return p;
      },
    });
    return { m, log, saved, players };
  };

  it('stays silent until the web unlock gesture, then plays at the master volume', () => {
    const { m, log } = setup(true);
    m.play('tap');
    expect(log).toEqual([]);
    m.unlock();
    m.play('tap');
    expect(log).toEqual(['play:tap@0.8']);
  });
  it('honours mute and volume, and saves only user updates', () => {
    const { m, log, saved } = setup(false);
    m.restore({ volume: 0.5 });
    expect(saved).toHaveLength(0);
    m.play('correct');
    m.update({ sfxOn: false });
    m.play('correct');
    m.update({ sfxOn: true, volume: 0 });
    m.play('correct');
    m.update({ volume: 7 });
    expect(m.getSettings().volume).toBe(1);
    expect(log).toEqual(['play:correct@0.5']);
    expect(saved).toHaveLength(3);
  });
  it('plays lobby BGM only while held, unlocked and enabled', () => {
    const { m, log, players } = setup(true);
    const release = m.holdBgm();
    expect(m.isBgmPlaying()).toBe(false);
    m.unlock();
    expect(m.isBgmPlaying()).toBe(true);
    expect(players.get('bgm')!.loop).toBe(true);
    expect(players.get('bgm')!.volume).toBeCloseTo(0.2);
    m.update({ bgmOn: false });
    m.update({ bgmOn: true });
    release();
    release();
    expect(m.isBgmPlaying()).toBe(false);
    expect(log).toEqual(['play:bgm@0.2', 'pause:bgm', 'play:bgm@0.2', 'pause:bgm']);
  });
  it('survives a backend that throws', () => {
    const m = new SoundManager({ locked: false, create: () => { throw new Error('no audio'); } });
    expect(() => m.play('tap')).not.toThrow();
  });
});
