import { Platform, type TextStyle } from 'react-native';

/**
 * The single font indirection (mockup p1): 티머니 둥근바람체 for titles, scores, levels and chosung
 * boxes; 에이투지체 for questions, explanations, buttons and timers.
 *
 * The licensed font files are not in the repo yet. To drop them in, put the files under
 * `assets/fonts/` and register them in `fontAssets` (keys are the family names used below);
 * `app/_layout.tsx` loads `fontAssets` with expo-font before rendering. Until then the system
 * Korean font is used (Apple SD Gothic Neo / Pretendard / Noto Sans KR), with heavy weights for
 * titles.
 */
export const fontAssets: Record<string, number> = {
  // TmoneyRoundWind: require('../../assets/fonts/TmoneyRoundWindExtraBold.ttf'),
  // A2z: require('../../assets/fonts/A2z-Regular.ttf'),
};

const hasTitleFont = 'TmoneyRoundWind' in fontAssets;
const hasBodyFont = 'A2z' in fontAssets;

const WEB_FALLBACK =
  '"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';

function family(loaded: boolean, name: string): string | undefined {
  if (Platform.OS === 'web') return loaded ? `"${name}", ${WEB_FALLBACK}` : WEB_FALLBACK;
  return loaded ? name : undefined;
}

export const fonts = {
  title: family(hasTitleFont, 'TmoneyRoundWind'),
  body: family(hasBodyFont, 'A2z'),
};

/** 둥근바람 · 제목과 큰 숫자 */
export function titleFont(size: number, weight: TextStyle['fontWeight'] = '800'): TextStyle {
  return { fontFamily: fonts.title, fontSize: size, fontWeight: hasTitleFont ? undefined : weight };
}

/** 에이투지체 · 본문과 버튼 */
export function bodyFont(size: number, weight: TextStyle['fontWeight'] = '500'): TextStyle {
  return { fontFamily: fonts.body, fontSize: size, fontWeight: weight };
}
