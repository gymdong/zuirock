import { questionInputSchema, type QuestionInput } from '@zuirock/shared';
import { normalize } from './chosung.js';

export type ImportIssueCode =
  /** File root is not a JSON array, or is empty. */
  | 'NOT_ARRAY'
  | 'EMPTY'
  /** Violates content/schema/question.schema.json (via questionInputSchema); one issue per zod issue. */
  | 'SCHEMA'
  /** mcq answer is not exactly one of the 4 choices. */
  | 'ANSWER_NOT_IN_CHOICES'
  /** Same normalized question text earlier in this file. */
  | 'DUPLICATE_IN_FILE'
  /** Same normalized question text as an existing question. */
  | 'DUPLICATE_EXISTING'
  /** Warning: the question text contains the answer (GUIDE §4). */
  | 'ANSWER_IN_QUESTION';

export interface ImportIssue {
  /** 1-based position in the file ("몇 번째 문제"); 0 for file-level errors. */
  index: number;
  field?: string;
  code: ImportIssueCode;
  message: string;
}

export interface ImportValidation {
  /** Questions that passed every error check; they become `draft`. */
  accepted: Array<{ index: number; question: QuestionInput; normalizedText: string }>;
  errors: ImportIssue[];
  /** Non-blocking; bulk approval requires zero warnings. */
  warnings: ImportIssue[];
}

/**
 * Import check (AC-C2): schema (required fields, ★1–5 in 0.5 steps, types, topic/subfield),
 * mcq choices contain the answer, duplicates in file / against `existingNormalizedTexts`
 * (normalized with `normalize`). Errors name the question number and the reason; only passing
 * questions are returned in `accepted`.
 */
export function validateImport(raw: unknown, existingNormalizedTexts: ReadonlySet<string>): ImportValidation {
  const result: ImportValidation = { accepted: [], errors: [], warnings: [] };
  if (!Array.isArray(raw)) {
    result.errors.push({ index: 0, code: 'NOT_ARRAY', message: '파일은 문제 배열(JSON array)이어야 합니다' });
    return result;
  }
  if (raw.length === 0) {
    result.errors.push({ index: 0, code: 'EMPTY', message: '문제가 하나도 없습니다' });
    return result;
  }
  const seen = new Map<string, number>();
  raw.forEach((item, i) => {
    const index = i + 1;
    const parsed = questionInputSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path.map(String).join('.');
        result.errors.push({ index, ...(field ? { field } : {}), code: 'SCHEMA', message: `${index}번째 문제: ${field || '문제'} — ${issue.message}` });
      }
      return;
    }
    const q = parsed.data;
    let ok = true;
    if (q.type === 'mcq' && !(q.choices ?? []).includes(q.answer)) {
      result.errors.push({ index, field: 'choices', code: 'ANSWER_NOT_IN_CHOICES', message: `${index}번째 문제: 정답이 보기 4개 중에 없습니다` });
      ok = false;
    }
    const normalizedText = normalize(q.question);
    const earlier = seen.get(normalizedText);
    if (earlier !== undefined) {
      result.errors.push({ index, field: 'question', code: 'DUPLICATE_IN_FILE', message: `${index}번째 문제: ${earlier}번째 문제와 문구가 같습니다` });
      ok = false;
    } else {
      seen.set(normalizedText, index);
    }
    if (existingNormalizedTexts.has(normalizedText)) {
      result.errors.push({ index, field: 'question', code: 'DUPLICATE_EXISTING', message: `${index}번째 문제: 이미 등록된 문제와 문구가 같습니다` });
      ok = false;
    }
    const normalizedAnswer = normalize(q.answer);
    if (q.type !== 'ox' && normalizedAnswer.length > 0 && normalizedText.includes(normalizedAnswer)) {
      result.warnings.push({ index, field: 'question', code: 'ANSWER_IN_QUESTION', message: `${index}번째 문제: 문제 문구에 정답이 들어 있습니다` });
    }
    if (ok) result.accepted.push({ index, question: q, normalizedText });
  });
  return result;
}
