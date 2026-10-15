import type { ChosungVerdict } from '@zuirock/shared';
import { NotImplementedError } from './errors.js';

/**
 * Initial consonants of Hangul syllables (U+AC00–U+D7A3) as Hangul Compatibility Jamo
 * (U+3131–), e.g. "세종" → "ㅅㅈ". Other characters are kept as-is.
 */
export function toChosung(text: string): string {
  throw new NotImplementedError('toChosung');
}

/**
 * Canonical form for answer comparison and duplicate question text: NFC, remove all whitespace,
 * punctuation (\p{P}) and symbols (\p{S}), lower-case ASCII letters.
 */
export function normalize(text: string): string {
  throw new NotImplementedError('normalize');
}

/**
 * Chosung judgement (AC-C5, AC-M6): compare normalize(input) with normalize(answer).
 * Equal → correct. Non-empty and one contains the other → near ("거의 비슷했어요!", submitter only,
 * counts as wrong). Otherwise wrong. No alternative-answer list.
 */
export function judgeChosung(input: string, answer: string): ChosungVerdict {
  throw new NotImplementedError('judgeChosung');
}
