import { z } from 'zod';
import { MVP_TOPIC_NAMES, QUESTION_TYPES, SUBFIELDS_BY_TOPIC, SUBFIELD_NAMES } from './enums.js';
import { isUri } from './uri.js';

/**
 * Zod mirror of `content/schema/question.schema.json` (the authoritative format, AC-C1).
 * It must give the same accept/reject verdict for every input; `test/question.schema.test.ts`
 * checks this against ajv. Script-level checks that the JSON schema leaves out (mcq answer is
 * one of the choices, duplicate question text) live in `validateImport` (@zuirock/game-rules).
 *
 * JSON Schema string lengths count code points, so lengths here use `[...s].length`.
 */

const codePoints = (s: string): number => [...s].length;

const text = (min: number, max: number) =>
  z.string().refine((s) => codePoints(s) >= min && codePoints(s) <= max, {
    message: `${min}~${max}자여야 합니다`,
  });

const CHOSUNG_ANSWER = /^[가-힣]{2,10}$/u;

export const questionSourceSchema = z.strictObject({
  title: text(2, 120),
  url: z.string().refine((u) => u === '' || (/^https?:\/\//u.test(u) && isUri(u)), {
    message: 'url은 빈 문자열이거나 http(s) 주소여야 합니다',
  }),
});

export const questionInputSchema = z
  .strictObject({
    /** Optional file-local number to help find an item in error messages; never stored. */
    no: z.number().int().min(1).optional(),
    topic: z.enum(MVP_TOPIC_NAMES),
    subfield: z.enum(SUBFIELD_NAMES),
    type: z.enum(QUESTION_TYPES),
    difficulty: z.number().min(1).max(5).multipleOf(0.5),
    question: text(5, 200),
    answer: text(1, 60),
    choices: z
      .array(text(1, 60))
      .length(4)
      .refine((cs) => new Set(cs).size === cs.length, { message: '보기가 중복됩니다' })
      .optional(),
    explanation: text(10, 400),
    source: questionSourceSchema,
  })
  .superRefine((q, ctx) => {
    const allowed: readonly string[] | undefined = SUBFIELDS_BY_TOPIC[q.topic];
    if (allowed && !allowed.includes(q.subfield)) {
      ctx.addIssue({ code: 'custom', path: ['subfield'], message: `${q.topic}의 세부 분야가 아닙니다` });
    }
    if (q.type === 'mcq' && q.choices === undefined) {
      ctx.addIssue({ code: 'custom', path: ['choices'], message: '객관식에는 보기 4개가 필요합니다' });
    }
    if (q.type === 'ox') {
      if (q.answer !== 'O' && q.answer !== 'X') {
        ctx.addIssue({ code: 'custom', path: ['answer'], message: 'OX 정답은 "O" 또는 "X"입니다' });
      }
      if (q.choices !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['choices'], message: 'OX에는 choices를 넣지 않습니다' });
      }
    }
    if (q.type === 'chosung') {
      if (!CHOSUNG_ANSWER.test(q.answer)) {
        ctx.addIssue({ code: 'custom', path: ['answer'], message: '초성 정답은 공백 없는 한글 2~10자입니다' });
      }
      if (q.choices !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['choices'], message: '초성퀴즈에는 choices를 넣지 않습니다' });
      }
    }
  });

/** A batch file: non-empty array of questions. */
export const questionBatchSchema = z.array(questionInputSchema).min(1);

/** One question as written in an import file (content/incoming/*.json). */
export type QuestionInput = z.infer<typeof questionInputSchema>;
export type QuestionSource = z.infer<typeof questionSourceSchema>;
