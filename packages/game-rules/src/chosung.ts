import type { ChosungVerdict } from '@zuirock/shared';

const SYLLABLE_FIRST = 0xac00;
const SYLLABLE_LAST = 0xd7a3;
/** The 19 initial consonants in syllable order, as Hangul Compatibility Jamo. */
const CHOSUNG = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];

/**
 * Initial consonants of Hangul syllables (U+AC00–U+D7A3) as Hangul Compatibility Jamo
 * (U+3131–), e.g. "세종" → "ㅅㅈ". Other characters are kept as-is.
 */
export function toChosung(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= SYLLABLE_FIRST && code <= SYLLABLE_LAST) {
      out += CHOSUNG[Math.floor((code - SYLLABLE_FIRST) / 588)];
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Canonical form for answer comparison and duplicate question text: NFC, remove all whitespace,
 * punctuation (\p{P}) and symbols (\p{S}), lower-case ASCII letters.
 */
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/**
 * Chosung judgement (AC-C5, AC-M6): compare normalize(input) with normalize(answer).
 * Equal → correct. Non-empty and one contains the other → near ("거의 비슷했어요!", submitter only,
 * counts as wrong). Otherwise wrong. No alternative-answer list.
 */
export function judgeChosung(input: string, answer: string): ChosungVerdict {
  const a = normalize(input);
  const b = normalize(answer);
  if (a.length === 0 || b.length === 0) return 'wrong';
  if (a === b) return 'correct';
  if (a.includes(b) || b.includes(a)) return 'near';
  return 'wrong';
}
