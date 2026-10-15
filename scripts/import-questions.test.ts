import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { builtinValidate, collectFiles, formatIssue, normalizeText, parseArgs, validateFile } from './import-questions.ts';

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

describe('helpers', () => {
  it('formats errors as 파일:N번째 문제: 이유', () => {
    expect(formatIssue('a.json', { index: 3, code: 'X', message: '틀림' })).toBe('a.json:3번째 문제: 틀림');
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
