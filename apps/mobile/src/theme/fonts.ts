/* eslint-disable @typescript-eslint/no-require-imports -- expo-font assets are loaded with require() */
import { Platform, type TextStyle } from 'react-native';

/**
 * The single font indirection (mockup p1): 티머니 둥근바람체 for titles, scores, levels and chosung
 * boxes; 에이투지체 for questions, explanations, buttons and timers.
 *
 * Files live in `assets/fonts/` and load through expo-font in `app/_layout.tsx`. The title font is a
 * KS X 1001 subset (2,350 Hangul syllables + Latin + common symbols, ~1MB instead of 6.5MB); other
 * glyphs fall back to the system font. Custom families have one weight each, so `bodyFont` maps the
 * requested weight to a family and leaves `fontWeight` unset (no synthetic bold).
 */
export const fontAssets: Record<string, number> = {
  TmoneyRoundWind: require('../../assets/fonts/TmoneyRoundWind-ExtraBold.ttf'),
  A2zMedium: require('../../assets/fonts/A2z-Medium.ttf'),
  A2zSemiBold: require('../../assets/fonts/A2z-SemiBold.ttf'),
  A2zBold: require('../../assets/fonts/A2z-Bold.ttf'),
};

const WEB_FALLBACK =
  '"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';

function family(name: string): string {
  return Platform.OS === 'web' ? `"${name}", ${WEB_FALLBACK}` : name;
}

export const fonts = {
  title: family('TmoneyRoundWind'),
  body: family('A2zMedium'),
};

function bodyFamily(weight: TextStyle['fontWeight']): string {
  const w = weight === 'bold' ? 700 : Number(weight ?? 500) || 500;
  return family(w >= 700 ? 'A2zBold' : w >= 600 ? 'A2zSemiBold' : 'A2zMedium');
}

/** 둥근바람 · 제목과 큰 숫자 */
export function titleFont(size: number, _weight: TextStyle['fontWeight'] = '800'): TextStyle {
  return { fontFamily: fonts.title, fontSize: size };
}

/** 에이투지체 · 본문과 버튼 */
export function bodyFont(size: number, weight: TextStyle['fontWeight'] = '500'): TextStyle {
  return { fontFamily: bodyFamily(weight), fontSize: size };
}
