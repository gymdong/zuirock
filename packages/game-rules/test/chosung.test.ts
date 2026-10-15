import { describe, expect, it } from 'vitest';
import { judgeChosung, normalize, toChosung } from '../src/chosung.js';

describe('toChosung', () => {
  it.each([
    ['세종', 'ㅅㅈ'],
    ['광합성', 'ㄱㅎㅅ'],
    ['까치', 'ㄲㅊ'],
    ['힣', 'ㅎ'],
    ['가', 'ㄱ'],
    ['A세 1', 'Aㅅ 1'],
    ['', ''],
  ])('%s → %s', (text, expected) => {
    expect(toChosung(text)).toBe(expected);
  });

  it('uses compatibility jamo (U+3131 block)', () => {
    expect(toChosung('가').codePointAt(0)).toBe(0x3131);
  });
});

describe('normalize', () => {
  it.each([
    ['세 종 대 왕', '세종대왕'],
    ['세종대왕!', '세종대왕'],
    ['"세종", 대왕?', '세종대왕'],
    ['DNA 구조', 'dna구조'],
    ['a+b=c', 'abc'],
    ['세종', '세종'], // NFD jamo → NFC
  ])('%j → %j', (text, expected) => {
    expect(normalize(text)).toBe(expected);
  });
});

describe('judgeChosung', () => {
  it.each([
    ['세종대왕', '세종대왕', 'correct'],
    ['세종 대왕', '세종대왕', 'correct'],
    ['세종대왕.', '세종대왕', 'correct'],
    ['세종', '세종대왕', 'near'], // answer contains input
    ['세종대왕님', '세종대왕', 'near'], // input contains answer
    ['세조', '세종대왕', 'wrong'],
    ['', '세종대왕', 'wrong'],
    ['   ', '세종대왕', 'wrong'],
    ['!!', '세종대왕', 'wrong'],
    ['ㅅㅈㄷㅇ', '세종대왕', 'wrong'],
  ] as const)('%j vs %j → %s', (input, answer, verdict) => {
    expect(judgeChosung(input, answer)).toBe(verdict);
  });
});
