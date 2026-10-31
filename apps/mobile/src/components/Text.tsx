import type { ComponentProps } from 'react';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';

/**
 * 폰의 '큰 글씨' 설정이 레이아웃을 깨지 않도록 글자 확대를 최대 1.2배로 제한한다.
 * (React 19에서는 Text.defaultProps 가 무시되어 감싼 컴포넌트를 쓴다. 앱 안에서는 react-native 의 Text 대신 이것을 쓴다.)
 */
export const MAX_FONT_SCALE = 1.2;

export function Text(props: ComponentProps<typeof RNText>) {
  return <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}

/** `ref` is an ordinary prop in React 19, so it passes through. */
export function TextInput(props: ComponentProps<typeof RNTextInput>) {
  return <RNTextInput maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}
