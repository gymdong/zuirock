import { describe, expect, it } from 'vitest';
import type { RoomSettings } from '@zuirock/shared';
import { rankPlayers } from '../src/ranking.js';
import {
  dedupeNickname,
  isQuestionComplete,
  validateGuestNickname,
  validateRoomSettings,
  type ParticipantQuestionState,
} from '../src/room-rules.js';
import { scoreAnswer } from '../src/scoring.js';

describe('scoreAnswer', () => {
  it.each([
    // type, correct, limit, remaining, beforeReveal, total
    ['mcq', true, 30_000, 30_000, false, 150],
    ['mcq', true, 30_000, 15_000, false, 125],
    ['mcq', true, 30_000, 0, false, 100],
    ['ox', true, 45_000, 44_999, true, 149], // floor(0.99997 × 50) = 49; no chosung bonus for ox
    ['mcq', true, 60_000, 59_000, true, 149],
    ['chosung', true, 30_000, 20_000, true, 163], // 100 + 33 + 30
    ['chosung', true, 60_000, 10_000, false, 108], // after reveal: no +30
    ['chosung', true, 60_000, 60_000, true, 180], // 힌트 없음 → beforeReveal always true (D6-1)
    ['mcq', false, 30_000, 30_000, false, 0],
    ['chosung', false, 30_000, 30_000, true, 0],
    ['mcq', true, 30_000, 40_000, false, 150], // clamped to the limit
    ['mcq', true, 30_000, -5, false, 100], // clamped to 0
  ] as const)('%s correct=%s limit=%i remaining=%i beforeReveal=%s → %i', (questionType, correct, timeLimitMs, remainingMs, beforeReveal, total) => {
    expect(scoreAnswer({ questionType, correct, timeLimitMs, remainingMs, beforeReveal }).total).toBe(total);
  });

  it('breaks the total down', () => {
    expect(scoreAnswer({ questionType: 'chosung', correct: true, timeLimitMs: 30_000, remainingMs: 15_000, beforeReveal: true })).toEqual({
      base: 100,
      speedBonus: 25,
      chosungBonus: 30,
      total: 155,
    });
  });

  it('treats a zero time limit as no speed bonus', () => {
    expect(scoreAnswer({ questionType: 'mcq', correct: true, timeLimitMs: 0, remainingMs: 0, beforeReveal: false }).total).toBe(100);
  });
});

describe('rankPlayers', () => {
  const p = (participantId: string, score: number, correctCount: number, totalResponseMs: number) => ({
    participantId,
    score,
    correctCount,
    totalResponseMs,
  });

  it.each([
    ['score desc', [p('a', 100, 1, 1), p('b', 300, 3, 9)], [['b', 1], ['a', 2]]],
    ['tie on score → correct count', [p('a', 300, 2, 1), p('b', 300, 3, 9)], [['b', 1], ['a', 2]]],
    ['tie on score and correct → faster total', [p('a', 300, 3, 9000), p('b', 300, 3, 5000)], [['b', 1], ['a', 2]]],
    ['full tie shares rank (1, 1, 3)', [p('c', 100, 1, 1), p('b', 300, 3, 5), p('a', 300, 3, 5)], [['a', 1], ['b', 1], ['c', 3]]],
    ['all zero', [p('b', 0, 0, 0), p('a', 0, 0, 0)], [['a', 1], ['b', 1]]],
  ] as const)('%s', (_name, input, expected) => {
    expect(rankPlayers(input).map((r) => [r.participantId, r.rank])).toEqual(expected);
  });

  it('returns [] for no players and keeps the input fields', () => {
    expect(rankPlayers([])).toEqual([]);
    expect(rankPlayers([p('a', 1, 2, 3)])).toEqual([{ ...p('a', 1, 2, 3), rank: 1 }]);
  });
});

describe('validateRoomSettings', () => {
  const ok: RoomSettings = {
    topicIds: ['science'],
    types: ['mcq', 'ox'],
    questionCount: 10,
    minDifficulty: 2,
    timeLimitSec: 30,
    chosungRevealSec: null,
  };
  const avail = ['general', 'vocab', 'history', 'science'] as const;

  it('accepts the E2E battle settings', () => {
    expect(validateRoomSettings(ok, avail)).toEqual({ ok: true });
  });

  it.each([
    [{ topicIds: [] }, ['TOPICS_EMPTY']],
    [{ topicIds: ['geography'] }, ['TOPIC_UNAVAILABLE']],
    [{ topicIds: ['science', 'science'] }, ['TOPIC_UNAVAILABLE']],
    [{ types: [] }, ['TYPES_EMPTY']],
    [{ types: ['mcq', 'mcq'] }, ['TYPES_EMPTY']],
    [{ questionCount: 4 }, ['QUESTION_COUNT_OUT_OF_RANGE']],
    [{ questionCount: 5 }, []],
    [{ questionCount: 100 }, []],
    [{ questionCount: 101 }, ['QUESTION_COUNT_OUT_OF_RANGE']],
    [{ questionCount: 10.5 }, ['QUESTION_COUNT_OUT_OF_RANGE']],
    [{ minDifficulty: 0.5 }, ['MIN_DIFFICULTY_INVALID']],
    [{ minDifficulty: 5.5 }, ['MIN_DIFFICULTY_INVALID']],
    [{ minDifficulty: 2.3 }, ['MIN_DIFFICULTY_INVALID']],
    [{ minDifficulty: 4.5 }, []],
    [{ timeLimitSec: 40 }, ['TIME_LIMIT_INVALID']],
    [{ timeLimitSec: 45 }, []],
    [{ chosungRevealSec: 20 }, []], // D-R2-1: any remaining N with 0 < N < limit
    [{ chosungRevealSec: 0 }, ['CHOSUNG_REVEAL_INVALID']],
    [{ chosungRevealSec: -5 }, ['CHOSUNG_REVEAL_INVALID']],
    [{ chosungRevealSec: 15.5 }, ['CHOSUNG_REVEAL_INVALID']],
    [{ chosungRevealSec: 1 }, []],
    [{ timeLimitSec: 30, chosungRevealSec: 29 }, []],
    [{ timeLimitSec: 30, chosungRevealSec: 15 }, []],
    [{ timeLimitSec: 60, chosungRevealSec: 60 }, ['CHOSUNG_REVEAL_NOT_BEFORE_LIMIT']],
    [{ timeLimitSec: 30, chosungRevealSec: 45 }, ['CHOSUNG_REVEAL_NOT_BEFORE_LIMIT']],
    [{ timeLimitSec: 30, chosungRevealSec: 30 }, ['CHOSUNG_REVEAL_NOT_BEFORE_LIMIT']],
    [{ timeLimitSec: 45, chosungRevealSec: 45 }, ['CHOSUNG_REVEAL_NOT_BEFORE_LIMIT']],
    [{ timeLimitSec: 45, chosungRevealSec: 30 }, []],
    [{ timeLimitSec: 60, chosungRevealSec: 45 }, []],
    [{ topicIds: [], types: [], questionCount: 0 }, ['TOPICS_EMPTY', 'TYPES_EMPTY', 'QUESTION_COUNT_OUT_OF_RANGE']],
  ] as const)('%j → %j', (patch, errors) => {
    const r = validateRoomSettings({ ...ok, ...patch } as RoomSettings, avail);
    expect(r).toEqual(errors.length === 0 ? { ok: true } : { ok: false, errors });
  });
});

describe('isQuestionComplete', () => {
  const s = (o: Partial<ParticipantQuestionState>): ParticipantQuestionState => ({
    participantId: 'x',
    connected: true,
    submitted: false,
    solved: false,
    gaveUp: false,
    ...o,
  });

  it.each([
    ['deadline reached', 'mcq', [s({})], 1000, true],
    ['mcq all submitted', 'mcq', [s({ submitted: true }), s({ submitted: true })], 0, true],
    ['mcq one pending', 'ox', [s({ submitted: true }), s({})], 0, false],
    ['disconnected ignored', 'mcq', [s({ submitted: true }), s({ connected: false })], 0, true],
    ['nobody connected → only deadline', 'mcq', [s({ connected: false })], 0, false],
    ['chosung solved + gave up', 'chosung', [s({ solved: true }), s({ gaveUp: true })], 0, true],
    ['chosung wrong attempts are not done', 'chosung', [s({ solved: true }), s({ submitted: true })], 0, false],
    ['chosung disconnected ignored', 'chosung', [s({ solved: true }), s({ connected: false })], 0, true],
  ] as const)('%s', (_n, questionType, participants, now, expected) => {
    expect(isQuestionComplete({ questionType, participants, now, deadlineAt: 1000 })).toBe(expected);
  });
});

describe('nicknames', () => {
  it.each([
    ['쥐돌', { ok: true, nickname: '쥐돌' }],
    ['  쥐돌이  ', { ok: true, nickname: '쥐돌이' }],
    ['가나다라마바사아자차', { ok: true, nickname: '가나다라마바사아자차' }],
    ['가나다라마바사아자차카', { ok: false, reason: 'TOO_LONG' }],
    ['쥐', { ok: false, reason: 'TOO_SHORT' }],
    ['   ', { ok: false, reason: 'TOO_SHORT' }],
    ['쥐\n돌', { ok: false, reason: 'INVALID_CHARS' }],
    ['😀😀', { ok: true, nickname: '😀😀' }], // counted by code point
  ] as const)('validateGuestNickname(%j)', (raw, expected) => {
    expect(validateGuestNickname(raw)).toEqual(expected);
  });

  it.each([
    ['쥐돌이', [], '쥐돌이'],
    ['쥐돌이', ['쥐돌이'], '쥐돌이2'],
    ['쥐돌이', ['쥐돌이', '쥐돌이2'], '쥐돌이3'],
    ['쥐돌이', ['쥐돌이', '쥐돌이3'], '쥐돌이2'],
    ['쥐돌이', ['쥐돌이2'], '쥐돌이'],
  ] as const)('dedupeNickname(%s, %j) = %s', (n, taken, expected) => {
    expect(dedupeNickname(n, taken)).toBe(expected);
  });
});
