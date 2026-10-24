import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { emit } from '../lib/events';
import { bodyFont, colors, radius } from '../theme';

export type ButtonVariant = 'primary' | 'cheese' | 'white' | 'kakao' | 'naver' | 'lavender' | 'danger' | 'correct';

const VARIANTS: Record<ButtonVariant, { face: string; edge: string; text: string; border?: string }> = {
  primary: { face: colors.primary, edge: colors.primaryDark, text: colors.white },
  cheese: { face: colors.cheese, edge: colors.cheeseDark, text: colors.ink },
  white: { face: colors.white, edge: colors.border, text: colors.ink, border: colors.border },
  kakao: { face: colors.kakao, edge: '#E2CC00', text: '#191600' },
  naver: { face: colors.naver, edge: '#02A64B', text: colors.white },
  lavender: { face: colors.lavender, edge: colors.lavenderStrong, text: colors.primary },
  danger: { face: colors.wrong, edge: '#D9503F', text: colors.white },
  correct: { face: colors.correct, edge: '#1F8F6E', text: colors.white },
};

const EDGE = 5;

interface Props {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  size?: 'lg' | 'md' | 'sm';
  left?: ReactNode;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Pill button with a bottom edge that collapses when pressed (mockup p1: "아래쪽 그림자로 눌리는 느낌"). */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  size = 'lg',
  left,
  right,
  style,
  testID,
}: Props) {
  const v = VARIANTS[variant];
  const height = size === 'lg' ? 58 : size === 'md' ? 48 : 38;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      disabled={inactive}
      onPress={() => {
        emit('tap');
        onPress?.();
      }}
      testID={testID}
      style={[{ height: height + EDGE }, style]}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.face,
            {
              height: height + (pressed ? 1 : EDGE),
              marginTop: pressed ? EDGE - 1 : 0,
              backgroundColor: v.face,
              borderBottomColor: v.edge,
              borderBottomWidth: pressed ? 1 : EDGE,
              borderRadius: size === 'sm' ? radius.md : radius.lg,
              opacity: inactive ? 0.5 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
            v.border ? { borderWidth: 2, borderColor: v.border, borderBottomWidth: pressed ? 2 : EDGE } : null,
          ]}
        >
          {left}
          {loading ? (
            <ActivityIndicator color={v.text} />
          ) : (
            <Text style={[bodyFont(size === 'sm' ? 14 : 17, '800'), { color: v.text }]} numberOfLines={1}>
              {label}
            </Text>
          )}
          {right}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
});
