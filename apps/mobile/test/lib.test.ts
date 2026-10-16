import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { battleXpCopy, signedPp, soloXpCopy, weekRange, wrongNoteCopy } from '../src/lib/copy';
import { createImeSubmitGuard, shouldSubmitOnKey } from '../src/lib/imeGuard';
import { androidIntentUrl, detectInAppBrowser, planEscape } from '../src/lib/inAppBrowser';
import { chosungBoxes, iGa, toCompatJamo } from '../src/lib/korean';
import { base64UrlEncode, codeChallengeS256, createPkcePair, type PkceCrypto } from '../src/lib/pkce';
import { TimeSync } from '../src/lib/timeSync';

const nodeCrypto: PkceCrypto = {
  randomBytes: (n) => new Uint8Array(randomBytes(n)),
  sha256: async (s) => new Uint8Array(createHash('sha256').update(s).digest()),
};

describe('pkce', () => {
  it('matches the RFC 7636 appendix B vector', async () => {
    expect(await codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', nodeCrypto)).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
  it('base64url pads nothing and maps +/ to -_', () => {
    expect(base64UrlEncode(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(base64UrlEncode(new Uint8Array([1]))).toBe('AQ');
  });
  it('creates a 43-char verifier and matching challenge', async () => {
    const p = await createPkcePair(nodeCrypto);
    expect(p.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.codeChallenge).toBe(createHash('sha256').update(p.codeVerifier).digest('base64url'));
  });
});

describe('timeSync', () => {
  it('uses the lowest-RTT ping and beats coarse observations', () => {
    let t = 1000;
    const s = new TimeSync(() => t);
    s.observe(5000, 1000);
    expect(s.offset).toBe(4000);
    s.addPing(1000, 6100, 1200); // rtt 200, offset 5000
    s.addPing(2000, 7040, 2080); // rtt 80, offset 5000
    s.addPing(3000, 9000, 3600); // rtt 600 ignored
    expect(s.offset).toBe(5000);
    s.observe(99999, 0); // ignored once synced
    t = 2000;
    expect(s.now()).toBe(7000);
    expect(s.secondsLeft(7000 + 20_100)).toBe(21);
    expect(s.secondsLeft(0)).toBe(0);
  });
});

const KAKAO_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 KAKAOTALK 10.4.5';
const IG_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0';
const IG_ANDROID = 'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Instagram 300.0';
const CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

describe('inAppBrowser', () => {
  const url = 'https://zuirock.example.com/join/4827?x=1';
  it('detects messengers and plain browsers', () => {
    expect(detectInAppBrowser(KAKAO_UA)).toBe('kakaotalk');
    expect(detectInAppBrowser(IG_IOS)).toBe('instagram');
    expect(detectInAppBrowser(CHROME)).toBeNull();
    expect(detectInAppBrowser('Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit Chrome/1 Mobile')).toBe('webview');
  });
  it('KakaoTalk escapes through openExternal', () => {
    expect(planEscape(url, KAKAO_UA)).toEqual({
      kind: 'redirect',
      href: `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`,
    });
  });
  it('Android webviews use intent:// without package= and with a fallback', () => {
    const plan = planEscape(url, IG_ANDROID);
    expect(plan.kind).toBe('redirect');
    const href = (plan as { href: string }).href;
    expect(href).toBe(androidIntentUrl(url));
    expect(href.startsWith('intent://zuirock.example.com/join/4827?x=1#Intent;scheme=https;')).toBe(true);
    expect(href).not.toContain('package=');
    expect(href).toContain(`S.browser_fallback_url=${encodeURIComponent(url)};end`);
  });
  it('iOS non-Kakao webviews get the help screen; normal browsers nothing', () => {
    expect(planEscape(url, IG_IOS)).toEqual({ kind: 'help', app: 'instagram', os: 'ios' });
    expect(planEscape(url, CHROME)).toEqual({ kind: 'none' });
  });
});

describe('IME guard', () => {
  it('ignores Enter while composing (isComposing or keyCode 229)', () => {
    expect(shouldSubmitOnKey({ key: 'Enter' })).toBe(true);
    expect(shouldSubmitOnKey({ key: 'Enter', isComposing: true })).toBe(false);
    expect(shouldSubmitOnKey({ key: 'Enter', keyCode: 229 })).toBe(false);
    expect(shouldSubmitOnKey({ key: 'a' })).toBe(false);
  });
  it('defers a mid-composition submit until compositionend with the final text', () => {
    const submit = vi.fn();
    const g = createImeSubmitGuard(submit);
    g.compositionStart();
    expect(g.requestSubmit('세종대와')).toBe(false);
    expect(submit).not.toHaveBeenCalled();
    g.compositionEnd('세종대왕 ');
    expect(submit).toHaveBeenCalledWith('세종대왕');
    expect(g.requestSubmit('   ')).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe('korean', () => {
  it('maps choseong to compat jamo and builds boxes', () => {
    expect(toCompatJamo('ᄉᄌ')).toBe('ㅅㅈ');
    expect(chosungBoxes('ㅅㅈ ㄷㅇ', 4)).toEqual(['ㅅ', 'ㅈ', 'ㄷ', 'ㅇ']);
    expect(chosungBoxes(undefined, 3)).toEqual([null, null, null]);
  });
  it('picks 이/가', () => {
    expect(iGa('역사')).toBe('역사가');
    expect(iGa('과학')).toBe('과학이');
  });
});

describe('copy', () => {
  const xp = { granted: 420, preCapTotal: 420, capReached: false, guestPreviewMax: 380 };
  it('shows "최대 N XP" for guests and +N for members', () => {
    expect(battleXpCopy(xp, true).value).toBe('최대 380 XP');
    expect(battleXpCopy(xp, false)).toEqual({ value: '+420', caption: '계정 XP' });
    expect(battleXpCopy({ ...xp, capReached: true }, false).caption).toBe('오늘 XP 상한 도달');
  });
  it('wrong-note sentence replaces the topic gauge copy', () => {
    expect(wrongNoteCopy(3)).toBe('틀린 3문제는 오답노트에 담았어요');
  });
  it('formats solo XP, deltas and week ranges', () => {
    expect(soloXpCopy({ granted: 0, preCapTotal: 0, capReached: false, ineligibleReason: 'BELOW_PASS' })).toBe(
      '7문제 이상 맞혀야 XP를 받아요',
    );
    expect(signedPp(-5)).toBe('−5');
    expect(signedPp(12)).toBe('+12');
    expect(weekRange('2026-10-07', '2026-10-13')).toBe('10월 7일 – 10월 13일');
  });
});

import type { RoomSnapshotDto } from '@zuirock/shared';
import { applyRoomEvent, applySnapshot, EMPTY_ROOM } from '../src/realtime/roomReducer';

describe('roomReducer', () => {
  const snap = {
    roomId: 'r', sessionId: null, code: '4827', phase: 'lobby', version: 5, hostParticipantId: 'p1',
    settings: { topicIds: ['history'], types: ['chosung'], questionCount: 5, minDifficulty: 1, timeLimitSec: 60, chosungRevealSec: 45 },
    participants: [], lobbyExpiresAt: null, question: null, you: { participantId: 'p1', question: null },
    reveal: null, results: null, serverNow: 0,
  } as RoomSnapshotDto;
  const q = { index: 0, total: 5, startedAt: 0, deadlineAt: 60_000, chosungRevealAt: 45_000,
    question: { id: 'q', topicId: 'history', subfield: '한국사', type: 'chosung', difficulty: 3, question: '?', answerLength: 4 } } as const;

  it('drops events older than the applied version (CAS fence)', () => {
    const v = applySnapshot(EMPTY_ROOM, snap);
    expect(applyRoomEvent(v, 'room:question', { version: 4, serverNow: 1, question: q })).toBe(v);
    const next = applyRoomEvent(v, 'room:question', { version: 6, serverNow: 1, question: q });
    expect(next.snapshot?.phase).toBe('question');
    expect(next.snapshot?.you.question?.attempts).toBe(0);
  });
  it('fills chosung only for the current question and records finish', () => {
    let v = applyRoomEvent(applySnapshot(EMPTY_ROOM, snap), 'room:question', { version: 6, serverNow: 1, question: q });
    v = applyRoomEvent(v, 'room:chosungReveal', { version: 7, serverNow: 2, questionIndex: 3, chosung: 'ㅅ' });
    expect(v.snapshot?.question?.chosung).toBeUndefined();
    v = applyRoomEvent(v, 'room:chosungReveal', { version: 8, serverNow: 2, questionIndex: 0, chosung: 'ㅅㅈㄷㅇ' });
    expect(v.snapshot?.question?.chosung).toBe('ㅅㅈㄷㅇ');
    const you = { participantId: 'p1', xp: { granted: 1, preCapTotal: 1, capReached: false }, wrongNotesAdded: 0, canSaveByLogin: false };
    v = applyRoomEvent(v, 'room:finished', { version: 9, serverNow: 3, sessionId: 's', results: [], you });
    expect(v.snapshot?.phase).toBe('finished');
    expect(v.finished?.you).toBe(you);
  });
});
