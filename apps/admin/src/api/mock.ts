import {
  TOPIC_ID_BY_NAME,
  questionInputSchema,
  type AdminQuestionDto,
  type ImportErrorDto,
  type MeDto,
  type QuestionInput,
  type QuestionStatus,
} from '@zuirock/shared';
import seed from '../../../../content/fixtures/dev-questions.json';
import { ApiError, type AdminApi, type CountRow } from './types.js';

const STATUSES: QuestionStatus[] = ['draft', 'reviewed', 'published', 'draft'];

function toDto(q: QuestionInput, i: number, status: QuestionStatus): AdminQuestionDto {
  const now = new Date(2026, 9, 17).toISOString();
  return {
    id: `mock-${i + 1}`,
    topicId: TOPIC_ID_BY_NAME[q.topic],
    subfield: q.subfield,
    type: q.type,
    difficulty: q.difficulty,
    question: q.question,
    ...(q.choices ? { choices: q.choices } : {}),
    ...(q.type === 'chosung' ? { answerLength: [...q.answer].length } : {}),
    answer: q.answer,
    explanation: q.explanation,
    source: q.source,
    status,
    recommendedDifficulty: null,
    solveCount: 0,
    correctRate: null,
    openReportCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

const norm = (s: string) => s.normalize('NFC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();

export function createMockApi(): AdminApi {
  let seeded = false;
  const rows: AdminQuestionDto[] = (seed as QuestionInput[]).map((q, i) => toDto(q, i, STATUSES[i % STATUSES.length]!));
  const me: MeDto = {
    id: 'mock-admin',
    nickname: '관리자(모의)',
    avatar: { source: 'character', url: null },
    level: { level: 1, totalXp: 0, xpIntoLevel: 0, xpForNextLevel: 100 },
    cheese: 0,
    isAdmin: true,
    providers: [],
    selectedTopicIds: [],
    equipped: {},
    createdAt: new Date(2026, 9, 1).toISOString(),
  };
  const find = (id: string) => {
    const r = rows.find((x) => x.id === id);
    if (!r) throw new ApiError(404, 'NOT_FOUND', '문제를 찾을 수 없습니다');
    return r;
  };
  return {
    me: async () => me,
    async listQuestions(q) {
      const limit = q.limit ?? 20;
      const filtered = rows.filter(
        (r) =>
          (!q.topicId || r.topicId === q.topicId) &&
          (!q.subfield || r.subfield === q.subfield) &&
          (!q.status || r.status === q.status) &&
          (!q.type || r.type === q.type) &&
          (q.difficulty === undefined || r.difficulty === q.difficulty),
      );
      const start = q.cursor ? Number(q.cursor) : 0;
      const end = start + limit;
      return { items: filtered.slice(start, end), nextCursor: end < filtered.length ? String(end) : null };
    },
    getQuestion: async (id) => find(id),
    async updateQuestion(id, body) {
      const r = find(id);
      Object.assign(r, body, { updatedAt: new Date().toISOString() });
      return r;
    },
    async seedVerify() {
      return {
        ok: seeded,
        observed: { weeklySolved: seeded ? 37 : 0, insufficientData: !seeded, weakTopics: seeded ? ['science', 'vocab'] : [], allocation: { science: 3 }, cheese: seeded ? 120 : 0, streak: seeded ? 5 : 0, topicLevels: { science: 25 }, openWrongNotes: seeded ? 12 : 0, friends: seeded ? 2 : 0 },
        checks: [
          { name: '이번 주 풀이 수', expected: 37, actual: seeded ? 37 : 0, ok: seeded },
          { name: '데이터 부족 아님', expected: false, actual: !seeded, ok: seeded },
        ],
      };
    },
    seedStatus: async () => ({ running: false }),
    async seedApply() {
      await new Promise((r) => setTimeout(r, 1500));
      seeded = true;
      return { userId: 'mock-admin', solves: 120, sets: 12, wrongNotes: 12, friends: 2, battles: 3, cheese: 120, streak: 5, durationMs: 1500 };
    },
    async bulkTransition(body) {
      const pool = body.ids
        ? body.ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is AdminQuestionDto => !!r)
        : rows.filter(
            (r) =>
              (!body.filter?.topicId || r.topicId === body.filter.topicId) &&
              (!body.filter?.subfield || r.subfield === body.filter.subfield) &&
              (!body.filter?.status || r.status === body.filter.status) &&
              (!body.filter?.type || r.type === body.filter.type) &&
              (body.filter?.difficulty === undefined || r.difficulty === body.filter.difficulty),
          );
      const limit = Math.min(body.limit ?? 500, 500);
      const skipped: Array<{ id: string; reason: string }> = [];
      let updated = 0;
      for (const r of pool.slice(0, limit)) {
        const ok = body.to === 'reviewed' ? r.status === 'draft' : r.status === 'draft' || r.status === 'reviewed';
        if (!ok) skipped.push({ id: r.id, reason: `${r.status} 상태는 ${body.to}로 바꿀 수 없어요` });
        else {
          r.status = body.to;
          updated++;
        }
      }
      return { updated, skipped, remaining: Math.max(0, pool.length - limit) };
    },
    async approve(body) {
      const targets = body.questionIds.map(find);
      if (targets.some((r) => r.status !== 'reviewed')) throw new ApiError(409, 'NOT_REVIEWED', 'reviewed 상태만 승인할 수 있습니다');
      for (const r of targets) r.status = 'published';
      return { published: targets.length };
    },
    async importQuestions(items, dryRun) {
      const errors: ImportErrorDto[] = [];
      const list = Array.isArray(items) ? (items as unknown[]) : [];
      if (!Array.isArray(items) || list.length === 0) {
        return { total: 0, acceptedCount: 0, errors: [{ index: 0, code: 'NOT_ARRAY', message: '비어 있지 않은 JSON 배열이어야 합니다' }], warnings: [], dryRun };
      }
      const seen = new Set(rows.map((r) => norm(r.question)));
      const ok: QuestionInput[] = [];
      list.forEach((item, i) => {
        const p = questionInputSchema.safeParse(item);
        if (!p.success) {
          for (const is of p.error.issues) errors.push({ index: i + 1, field: is.path.join('.'), code: 'SCHEMA', message: is.message });
          return;
        }
        if (p.data.type === 'mcq' && !p.data.choices?.includes(p.data.answer)) {
          errors.push({ index: i + 1, field: 'answer', code: 'ANSWER_NOT_IN_CHOICES', message: '정답이 보기 중에 없습니다' });
          return;
        }
        const n = norm(p.data.question);
        if (seen.has(n)) {
          errors.push({ index: i + 1, field: 'question', code: 'DUPLICATE', message: '이미 있는 문구입니다' });
          return;
        }
        seen.add(n);
        ok.push(p.data);
      });
      if (!dryRun) ok.forEach((q) => rows.push(toDto(q, rows.length, 'draft')));
      return { total: list.length, acceptedCount: ok.length, errors, warnings: [], dryRun };
    },
    async counts() {
      const map = new Map<string, CountRow>();
      for (const r of rows) {
        const k = `${r.topicId}|${r.difficulty}|${r.type}|${r.status}`;
        const cur = map.get(k);
        if (cur) cur.count++;
        else map.set(k, { topicId: r.topicId, difficulty: r.difficulty, type: r.type, status: r.status, count: 1 });
      }
      return [...map.values()];
    },
  };
}
