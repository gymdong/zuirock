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
import { mockMe, QUESTIONS, TOPIC_LEVELS, TOPICS } from './data';
import { createMockRoom, lookupMockRoom } from './room';

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
        user: mockMe(selected),
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

  if (path === '/me') return mockMe(selected);
  if (path === '/topics') return TOPICS;
  if (path === '/me/topics' && method === 'PUT') {
    selected = (body as { topicIds: TopicId[] }).topicIds;
    return mockMe(selected);
  }
  if (path.startsWith('/me/topics/')) {
    const topicId = path.split('/')[3] as TopicId;
    const level = TOPIC_LEVELS[topicId] ?? 1;
    return { topicId, level, highestClearedStage: level - 1, completed: false, selected: true, started: true };
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
    } satisfies SetResultDto);
  }
  throw new ApiError(404, 'NOT_FOUND', `mock: ${method} ${path}`);
}

setMockHandler((method, path, body, token) => handle(method, path, body, token));
