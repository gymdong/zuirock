/** Hangul Choseong (U+1100–U+1112) → Hangul Compatibility Jamo, for chosung boxes. */
const CHOSEONG_TO_COMPAT = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

/** Convert any choseong code points to compat jamo; other characters pass through. */
export function toCompatJamo(text: string): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    out += cp >= 0x1100 && cp <= 0x1112 ? CHOSEONG_TO_COMPAT[cp - 0x1100]! : ch;
  }
  return out;
}

/** One box per syllable: whitespace is dropped (boxes show letters only). */
export function chosungBoxes(chosung: string | undefined, length: number): Array<string | null> {
  const letters = chosung ? [...toCompatJamo(chosung)].filter((c) => c.trim() !== '') : [];
  const n = Math.max(length, letters.length);
  return Array.from({ length: n }, (_, i) => letters[i] ?? null);
}

function hasFinalConsonant(word: string): boolean {
  const last = word.trim().slice(-1);
  const cp = last.codePointAt(0) ?? 0;
  if (cp < 0xac00 || cp > 0xd7a3) return false;
  return (cp - 0xac00) % 28 !== 0;
}

/** 이/가 particle: "역사가", "과학이". */
export function iGa(word: string): string {
  return word + (hasFinalConsonant(word) ? '이' : '가');
}

/** 은/는 particle. */
export function eunNeun(word: string): string {
  return word + (hasFinalConsonant(word) ? '은' : '는');
}
