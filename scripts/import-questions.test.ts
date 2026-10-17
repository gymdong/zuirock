import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { builtinValidate, collectFiles, formatIssue, itemInfo, locateItems, normalizeText, parseArgs, validateFile } from './import-questions.ts';

const base = {
  topic: '과학',
  subfield: '물리',
  type: 'ox',
  difficulty: 2,
  question: '빛은 소리보다 빠르다.',
  answer: 'O',
  explanation: '빛은 초속 약 30만 km로 소리보다 훨씬 빠르다.',
  source: { title: '중학교 과학 교과서', url: '' },
};
const bad = JSON.parse(readFileSync(new URL('./__fixtures__/bad-cases/bad.json', import.meta.url), 'utf8'));

describe('builtinValidate', () => {
  it('accepts a valid question', () => {
    const v = builtinValidate([base], new Set());
    expect(v.errors).toEqual([]);
    expect(v.accepted).toHaveLength(1);
  });
  it('reports non-array and empty files', () => {
    expect(builtinValidate({}, new Set()).errors[0]?.code).toBe('NOT_ARRAY');
    expect(builtinValidate([], new Set()).errors[0]?.code).toBe('EMPTY');
  });
  it('reports each bad case with its 1-based index', () => {
    const v = builtinValidate(bad, new Set());
    expect(v.accepted).toHaveLength(1);
    const idx = new Set(v.errors.map((e) => e.index));
    expect([...idx]).toEqual([1, 2, 3, 5]);
    expect(v.errors.find((e) => e.code === 'ANSWER_NOT_IN_CHOICES')?.index).toBe(1);
    expect(v.errors.find((e) => e.code === 'DUPLICATE_IN_FILE')?.index).toBe(5);
  });
  it('rejects text already existing (re-run safe)', () => {
    const v = builtinValidate([base], new Set([normalizeText(base.question)]));
    expect(v.errors[0]?.code).toBe('DUPLICATE_EXISTING');
  });
  it('validateFile falls back while LA is unimplemented or delegates once done', () => {
    expect(validateFile([base], new Set()).accepted).toHaveLength(1);
  });
});

describe('item identification', () => {
  const text = readFileSync(new URL('./__fixtures__/bad-cases/bad.json', import.meta.url), 'utf8');
  it('locates each top-level item by line', () => {
    expect(locateItems(text).map((l) => l.line)).toEqual([2, 3, 4, 5, 6]);
    expect(locateItems('[{"a":"x,\\"[{"},\n {"b":[1,2]}]').map((l) => l.line)).toEqual([1, 2]);
  });
  it('formats no, index, line and a 25-character preview', () => {
    const info = itemInfo(bad, locateItems(text), 5);
    expect(info).toMatchObject({ no: 5, line: 6, preview: '같은 문구가 두 번 나오는 문제이다!' });
    expect(formatIssue('f.json', { index: 5, field: 'question', code: 'X', message: '5번째 문제: 중복' }, info)).toBe(
      "f.json:5번째(no 5, 줄 6) '같은 문구가 두 번 나오는 문제이다!' [question] 중복",
    );
    const long = itemInfo([{ question: '가'.repeat(30) }], [{ line: 3 }], 1);
    expect(long.preview).toBe(`${'가'.repeat(25)}…`);
  });
  it('accepts the optional no field and ignores it for duplicates', () => {
    const v = builtinValidate([{ ...base, no: 1 }, { ...base, no: 2 }], new Set());
    expect(v.errors.map((e) => e.code)).toEqual(['DUPLICATE_IN_FILE']);
    expect(builtinValidate([{ ...base, no: 0 }], new Set()).errors[0]?.field).toBe('no');
  });
});

describe('helpers', () => {
  it('formats errors as 파일:N번째 이유', () => {
    expect(formatIssue('a.json', { index: 3, code: 'X', message: '틀림' })).toBe('a.json:3번째 틀림');
  });
  it('parseArgs requires a mode and inputs', () => {
    expect(() => parseArgs(['a.json'])).toThrow();
    expect(() => parseArgs(['--dry-run'])).toThrow();
    expect(parseArgs(['--dry-run', 'a.json'])).toEqual({ dryRun: true, inputs: ['a.json'] });
    expect(parseArgs(['--target', 'prod', 'a.json'])).toMatchObject({ target: 'prod' });
  });
  it('collectFiles walks directories', () => {
    const files = collectFiles([new URL('./__fixtures__/bad-cases', import.meta.url).pathname]);
    expect(files.length).toBe(3);
  });
});
