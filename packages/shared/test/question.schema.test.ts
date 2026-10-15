import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { questionBatchSchema } from '../src/question.schema.js';

// ajv-formats is CJS; under NodeNext its default import is the module namespace.
const addFormats = addFormatsModule as unknown as typeof addFormatsModule.default;

const contentPath = (p: string) => fileURLToPath(new URL(`../../../content/${p}`, import.meta.url));

const jsonSchema = JSON.parse(readFileSync(contentPath('schema/question.schema.json'), 'utf8')) as object;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validateWithJsonSchema = ajv.compile(jsonSchema);

/** The example batch in content/GUIDE.md §5 (first ```json block). */
function guideExample(): Record<string, unknown>[] {
  const guide = readFileSync(contentPath('GUIDE.md'), 'utf8');
  const block = /```json\n([\s\S]*?)```/.exec(guide);
  if (!block?.[1]) throw new Error('GUIDE.md example JSON block not found');
  return JSON.parse(block[1]) as Record<string, unknown>[];
}

function verdicts(batch: unknown) {
  return {
    jsonSchema: validateWithJsonSchema(batch) === true,
    zod: questionBatchSchema.safeParse(batch).success,
  };
}

const examples = guideExample();
const [chosungEx, mcqEx, oxEx] = examples as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];
const withPatch = (base: Record<string, unknown>, patch: Record<string, unknown>) => {
  const q: Record<string, unknown> = { ...base, ...patch };
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete q[k];
  return q;
};

describe('question.schema.ts ≡ content/schema/question.schema.json', () => {
  it('GUIDE.md example has one question of each type', () => {
    expect(examples.map((q) => q.type)).toEqual(['chosung', 'mcq', 'ox']);
  });

  it('accepts the GUIDE.md example batch in both validators', () => {
    expect(verdicts(examples)).toEqual({ jsonSchema: true, zod: true });
  });

  const cases: Array<[name: string, batch: unknown, accepted: boolean]> = [
    ['GUIDE chosung example alone', [chosungEx], true],
    ['GUIDE mcq example alone', [mcqEx], true],
    ['GUIDE ox example alone', [oxEx], true],
    // required bad cases
    ['wrong subfield for topic (역사/물리)', [withPatch(chosungEx, { subfield: '물리' })], false],
    ['difficulty 3.3', [withPatch(mcqEx, { difficulty: 3.3 })], false],
    ['ox with choices', [withPatch(oxEx, { choices: ['O', 'X', '모름', '둘다'] })], false],
    ['chosung answer with a space', [withPatch(chosungEx, { answer: '세종 대왕' })], false],
    ['mcq without choices', [withPatch(mcqEx, { choices: undefined })], false],
    // further boundaries
    ['empty batch', [], false],
    ['not an array', chosungEx, false],
    ['difficulty 0.5 (below range)', [withPatch(mcqEx, { difficulty: 0.5 })], false],
    ['difficulty 5.5 (above range)', [withPatch(mcqEx, { difficulty: 5.5 })], false],
    ['difficulty 5', [withPatch(mcqEx, { difficulty: 5 })], true],
    ['difficulty as string', [withPatch(mcqEx, { difficulty: '3' })], false],
    ['unknown topic (지리)', [withPatch(oxEx, { topic: '지리' })], false],
    ['unknown type', [withPatch(oxEx, { type: 'short' })], false],
    ['extra property', [withPatch(oxEx, { hint: 'x' })], false],
    ['missing source', [withPatch(oxEx, { source: undefined })], false],
    ['source with extra key', [withPatch(oxEx, { source: { title: '사전', url: '', page: 1 } })], false],
    ['source.title too short', [withPatch(oxEx, { source: { title: '사', url: '' } })], false],
    ['source.url https', [withPatch(oxEx, { source: { title: '사전', url: 'https://stdict.korean.go.kr/' } })], true],
    ['source.url ftp', [withPatch(oxEx, { source: { title: '사전', url: 'ftp://example.com/a' } })], false],
    ['source.url with raw Hangul', [withPatch(oxEx, { source: { title: '위키', url: 'https://ko.wikipedia.org/wiki/세종' } })], false],
    [
      'source.url percent-encoded Hangul',
      [withPatch(oxEx, { source: { title: '위키', url: 'https://ko.wikipedia.org/wiki/%EC%84%B8%EC%A2%85' } })],
      true,
    ],
    ['ox answer lowercase o', [withPatch(oxEx, { answer: 'o' })], false],
    ['chosung one syllable', [withPatch(chosungEx, { answer: '왕' })], false],
    ['chosung 11 syllables', [withPatch(chosungEx, { answer: '가나다라마바사아자차카' })], false],
    ['chosung with digits', [withPatch(chosungEx, { answer: '세종1' })], false],
    ['chosung with choices', [withPatch(chosungEx, { choices: ['세종', '태종', '성종', '정조'] })], false],
    ['mcq with 3 choices', [withPatch(mcqEx, { choices: ['a', 'b', 'c'] })], false],
    ['mcq with duplicate choices', [withPatch(mcqEx, { choices: ['a', 'a', 'b', 'c'] })], false],
    ['mcq with empty choice', [withPatch(mcqEx, { choices: ['', 'a', 'b', 'c'] })], false],
    ['explanation too short', [withPatch(mcqEx, { explanation: '짧다' })], false],
    ['question 4 chars', [withPatch(mcqEx, { question: '무엇일까' })], false],
    ['question of 5 emoji (5 code points, 10 UTF-16 units)', [withPatch(mcqEx, { question: '😀😀😀😀😀' })], true],
    ['answer 61 chars', [withPatch(mcqEx, { answer: 'a'.repeat(61) })], false],
    ['one bad item in a good batch', [chosungEx, withPatch(mcqEx, { difficulty: 3.3 }), oxEx], false],
  ];

  it.each(cases)('%s', (_name, batch, accepted) => {
    expect(verdicts(batch)).toEqual({ jsonSchema: accepted, zod: accepted });
  });
});
