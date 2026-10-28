import { judgeChosung, normalize } from '@zuirock/game-rules';
import type {
  AuthSession,
  CreateRoomRequest,
  GuestSession,
  SetResultDto,
  SetSessionDto,
  SoloSubmitRequest,
  StartSetRequest,
  TopicId,
  WeaknessReportDto,
  WeeklyReportDto,
  WrongNoteDto,
} from '@zuirock/shared';
import { ApiError, setMockHandler, type Method } from '../src/api/client';
import { mockMe, MOCK_STAGE_COUNT, QUESTIONS, TOPIC_LEVELS, TOPICS } from './data';
import { createMockRoom, lookupMockRoom } from './room';
import { grantMockChest, handleEconomy, wallet } from './economy';

/**
 * In-app mock of the REST API (EXPO_PUBLIC_API_MOCK=1). Paths and shapes follow the DTO JSDoc in
 * @zuirock/shared. State lives in memory; reload resets it.
 * `?mock=empty` in the web URL starts with no selected topics (p3), `?mock=fresh` with an
 * insufficient-data report.
 */
const flag = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search).get('mock') : null;
let selected: TopicId[] = flag === 'empty' ? [] : ['general', 'vocab', 'history', 'science'];
const sets = new Map<string, { kind: StartSetRequest['kind']; correct: Set<string>; done: Set<string>; wrong: string[] }>();
const wrongNotes: WrongNoteDto[] = QUESTIONS.slice(1, 3).map((m) => ({
  questionId: m.pub.id,
  question: m.pub,
  reveal: m.reveal,
  status: 'open',
  wrongCount: 1,
  lastWrongAt: '2026-10-15T09:00:00.000Z',
  reviewedAt: null,
}));
let seq = 0;
let nickname = '치즈러버';
let avatarSource: 'social' | 'upload' | 'character' = 'character';
let equipped: Record<string, string> = { hat: 'hat-cone' };
const owned = new Set(['hat-cone', 'top-basic']);
const me = () => ({ ...mockMe(selected), nickname, cheese: wallet.cheese, equipped, avatar: { source: avatarSource, url: null } });
const ITEMS = [
  ['hat-cone', 'hat', '고깔모자', 'default', null, null],
  ['hat-beret', 'hat', '베레모', 'cheese', 80, null],
  ['hat-crown', 'hat', '왕관', 'level', null, 20],
  ['top-basic', 'top', '기본 티셔츠', 'default', null, null],
  ['top-hoodie', 'top', '후드티', 'cheese', 150, null],
  ['bottom-jeans', 'bottom', '청바지', 'cheese', 80, null],
  ['shoes-sneakers', 'shoes', '운동화', 'cheese', 80, null],
  ['acc-scarf', 'accessory', '목도리', 'level', null, 20],
].map(([id, slot, name, acquire, price, unlockLevel], i) => ({
  id: id as string,
  slot: slot as 'hat',
  name: name as string,
  imageUrl: '',
  acquire: acquire as 'default',
  price: price as number | null,
  unlockLevel: unlockLevel as number | null,
  sortOrder: i,
}));
const FRIENDS = [
  { userId: 'u-acorn', nickname: '도토리박사', avatar: { source: 'character' as const, url: null }, level: 8 },
  { userId: 'u-bread', nickname: '소금빵', avatar: { source: 'character' as const, url: null }, level: 15 },
];

const weekly: WeeklyReportDto = {
  weekStart: '2026-10-12',
  weekEnd: '2026-10-18',
  finalized: false,
  solved: 186,
  correctRate: 0.74,
  streakDays: 7,
  byTopic: [
    { topicId: 'vocab', solved: 40, correctRate: 0.86, prevCorrectRate: 0.83, deltaPp: 3 },
    { topicId: 'history', solved: 52, correctRate: 0.81, prevCorrectRate: 0.69, deltaPp: 12 },
    { topicId: 'general', solved: 38, correctRate: 0.75, prevCorrectRate: 0.75, deltaPp: 0 },
    { topicId: 'geography', solved: 21, correctRate: 0.68, prevCorrectRate: 0.64, deltaPp: 4 },
    { topicId: 'science', solved: 35, correctRate: 0.52, prevCorrectRate: 0.57, deltaPp: -5 },
  ],
  mostImproved: { topicId: 'history', deltaPp: 12 },
};

const weakness: WeaknessReportDto = {
  weekStart: '2026-10-12',
  weeklySolved: 186,
  insufficientData: false,
  minWeeklySolves: 30,
  weaknesses: [
    { subfieldId: 'sf-chem', subfield: '화학', topicId: 'science', solved: 12, wrongRate: 0.58, avgResponseMs: 9000, wrongNoteCount: 4, reason: '원소 기호를 자주 헷갈려요' },
    { subfieldId: 'sf-phys', subfield: '물리', topicId: 'science', solved: 11, wrongRate: 0.45, avgResponseMs: 14000, wrongNoteCount: 3, reason: '응답 시간이 가장 길어요' },
    { subfieldId: 'sf-hist', subfield: '세계사', topicId: 'history', solved: 9, wrongRate: 0.33, avgResponseMs: 8000, wrongNoteCount: 6, reason: '오답노트에 6문제' },
  ],
  weakTopics: ['science', 'geography'],
  diagnostic: null,
  quest: { subfieldId: 'sf-chem', completedThisWeek: false },
};

function delay<T>(v: T): Promise<T> {
  return new Promise((r) => setTimeout(() => r(v), 120));
}

async function handle(method: Method, path: string, body: unknown, token: string | null): Promise<unknown> {
  const member = token === 'mock-member';
  const key = `${method} ${path}`;
  const id = path.split('/')[3] ?? '';

  switch (key) {
    case 'POST /auth/kakao/start':
    case 'POST /auth/naver/start':
    case 'POST /auth/google/start': {
      const { returnTo } = body as { returnTo: string };
      return { authorizeUrl: `${returnTo}?code=mock-code` };
    }
    case 'POST /auth/exchange':
      return {
        accessToken: 'mock-member',
        expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
        user: me(),
      } satisfies AuthSession;
    case 'POST /guests': {
      const nickname = (body as { nickname: string }).nickname;
      return {
        guestId: `g-${++seq}`,
        guestToken: `mock-guest:${encodeURIComponent(nickname)}`,
        nickname,
        expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
      } satisfies GuestSession;
    }
  }
  if (path.startsWith('/rooms')) {
    if (method === 'POST') {
      if (!member) throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요해요.');
      return createMockRoom((body as CreateRoomRequest).settings);
    }
    const room = lookupMockRoom(path.split('/')[2] ?? '');
    if (!room) throw new ApiError(404, 'ROOM_NOT_FOUND', '방을 찾을 수 없어요. 코드를 확인해 주세요.');
    return room;
  }
  if (!member) throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요해요.');
  const economy = handleEconomy(method, path, body);
  if (economy !== undefined) return delay(economy);

  if (path === '/me' && method === 'PATCH') {
    const b = body as { nickname?: string; avatarSource?: 'social' | 'upload' | 'character' };
    if (b.nickname) nickname = b.nickname;
    if (b.avatarSource) avatarSource = b.avatarSource;
    return me();
  }
  if (path === '/me') return me();
  if (path.startsWith('/users/nickname-available')) {
    const n = decodeURIComponent(path.split('nickname=')[1] ?? '');
    const reason = !n.trim() ? 'EMPTY' : [...n].length > 10 ? 'TOO_LONG' : n === '도토리박사' ? 'TAKEN' : undefined;
    return { nickname: n, available: !reason, reason };
  }
  if (path === '/assets' && method === 'POST') return { key: 'mock-asset', url: '' };
  if (path === '/reports/history')
    return {
      totalSolved: 2340,
      correctRate: 0.74,
      longestStreak: 23,
      battles: { played: 52, wins: 31, podiums: 44 },
      monthly: [],
      byTopic: [],
    };
  if (path === '/me/wardrobe' || path === '/me/wardrobe/equipped') {
    if (method === 'PUT') equipped = (body as { equipped: typeof equipped }).equipped;
    return { bodyImageUrl: '', items: ITEMS.map((it) => ({ ...it, owned: owned.has(it.id) })), equipped, cheese: wallet.cheese };
  }
  if (path.startsWith('/me/wardrobe/items/')) {
    const it = ITEMS.find((x) => x.id === path.split('/')[4])!;
    if ((it.price ?? 0) > wallet.cheese) throw new ApiError(409, 'NOT_ENOUGH_CHEESE', '치즈가 부족해요.');
    wallet.cheese -= it.price ?? 0;
    owned.add(it.id);
    return { itemId: it.id, cheese: wallet.cheese };
  }
  if (path === '/friends') return { friends: FRIENDS, incoming: [], outgoing: [] };
  if (path.startsWith('/friends/')) {
    const f = FRIENDS.find((x) => x.userId === path.split('/')[2]) ?? FRIENDS[0]!;
    return {
      userId: f.userId,
      nickname: f.nickname,
      avatar: f.avatar,
      equipped: {},
      level: { level: f.level, totalXp: 0, xpIntoLevel: 0, xpForNextLevel: 100 * f.level },
      topicLevels: [
        { topicId: 'science', level: 8 },
        { topicId: 'general', level: 5 },
        { topicId: 'history', level: 3 },
        { topicId: 'philosophy', level: 2 },
      ],
      headToHead: { played: 5, wins: 3, losses: 2, draws: 0, lastPlayedAt: '2026-10-14T10:00:00.000Z' },
    };
  }
  if (path === '/topics') return TOPICS;
  if (path === '/me/topics' && method === 'PUT') {
    selected = (body as { topicIds: TopicId[] }).topicIds;
    return mockMe(selected);
  }
  if (path.startsWith('/me/topics/')) {
    const topicId = path.split('/')[3] as TopicId;
    const level = TOPIC_LEVELS[topicId] ?? 1;
    return {
      topicId, level, highestClearedStage: level - 1, completed: false, selected: true, started: true,
      stageCount: MOCK_STAGE_COUNT, checkpoints: [5, 10], stage: { minDifficulty: 1 + (level - 1) * 0.4, maxDifficulty: 1.5 + (level - 1) * 0.4 },
    };
  }
  if (path === '/me/streak')
    return { current: 7, longest: 23, todayCounted: false, protections: 1, maxProtections: 2, protectionPrice: 50, restorable: null, nextMilestone: { days: 14, cheese: 30 } };
  if (path === '/me/wrong-notes') return wrongNotes;
  if (path === '/solo/daily') return { kstDay: '2026-10-16', completed: false, xpGranted: false };
  if (path === '/reports/weekly/current') return flag === 'fresh' ? { ...weekly, solved: 12, byTopic: [], mostImproved: null } : weekly;
  if (path === '/reports/weakness')
    return flag === 'fresh'
      ? { ...weakness, weeklySolved: 12, insufficientData: true, weaknesses: [], quest: null, diagnostic: { questionCount: 20 } }
      : weakness;

  if (path === '/solo/sets' && method === 'POST') {
    const req = body as StartSetRequest;
    const setAttemptId = `set-${++seq}`;
    sets.set(setAttemptId, { kind: req.kind, correct: new Set(), done: new Set(), wrong: [] });
    const questions = [...QUESTIONS, ...QUESTIONS.slice(0, 2)].map((m, i) => ({ ...m.pub, id: `${m.pub.id}-${i}` }));
    return {
      setAttemptId,
      kind: req.kind,
      topicId: req.topicId ?? null,
      level: req.topicId ? (TOPIC_LEVELS[req.topicId] ?? 1) : null,
      questions,
      reviewQuestionIds: [questions[1]!.id],
      xpEligible: true,
      startedAt: new Date().toISOString(),
    } satisfies SetSessionDto;
  }
  const set = sets.get(id);
  const findQ = (qid: string) => QUESTIONS.find((m) => qid.startsWith(`${m.pub.id}-`))!;
  if (set && path.endsWith('/answers')) {
    const req = body as SoloSubmitRequest;
    const m = findQ(req.questionId);
    const verdict =
      m.pub.type === 'chosung'
        ? judgeChosung(req.answer, m.reveal.answer)
        : normalize(req.answer) === normalize(m.reveal.answer)
          ? 'correct'
          : 'wrong';
    const final = verdict === 'correct' || m.pub.type !== 'chosung';
    if (final) {
      set.done.add(req.questionId);
      if (verdict === 'correct') set.correct.add(req.questionId);
      else set.wrong.push(req.questionId);
    }
    return delay({ verdict, final, reveal: final ? { ...m.reveal, questionId: req.questionId } : undefined });
  }
  if (set && path.endsWith('/hint')) {
    const qid = (body as { questionId: string }).questionId;
    return delay({ questionId: qid, chosung: findQ(qid).chosung ?? '' });
  }
  if (set && path.endsWith('/give-up')) {
    const qid = (body as { questionId: string }).questionId;
    set.done.add(qid);
    set.wrong.push(qid);
    return delay({ reveal: { ...findQ(qid).reveal, questionId: qid } });
  }
  if (set && path.endsWith('/complete')) {
    const correctCount = set.correct.size;
    const passed = correctCount >= 7;
    return delay({
      setAttemptId: id,
      kind: set.kind,
      correctCount,
      totalCount: 10,
      passed,
      firstClear: set.kind === 'stage' && passed,
      topicLevel: set.kind === 'stage' ? 35 : null,
      xp: passed
        ? { granted: correctCount * 36, preCapTotal: correctCount * 36, capReached: false }
        : { granted: 0, preCapTotal: 0, capReached: false, ineligibleReason: set.kind === 'stage' ? 'STAGE_FAILED' : 'BELOW_PASS' },
      streakCounted: true,
      wrongNotesAdded: set.wrong.length,
      ...(set.kind === 'stage' && passed ? { chest: grantMockChest(35) } : {}),
    } satisfies SetResultDto);
  }
  throw new ApiError(404, 'NOT_FOUND', `mock: ${method} ${path}`);
}

setMockHandler((method, path, body, token) => handle(method, path, body, token));
