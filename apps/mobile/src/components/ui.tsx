import { useEffect, type ReactNode } from 'react';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { bodyFont, colors, radius, titleFont } from '../theme';
import { Icon } from './Icon';

/** White rounded card with the cream border used across the mockup. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Icon name="cheese" size={18} />
      <Text style={[titleFont(19), { color: colors.ink, flex: 1 }]}>{children}</Text>
      {right}
    </View>
  );
}

/** Small rounded tag (lavender by default). */
export function Tag({ label, bg = colors.lavender, color = colors.ink, style }: { label: string; bg?: string; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }, style]}>
      <Text style={[bodyFont(14, '700'), { color }]}>{label}</Text>
    </View>
  );
}

/** Selectable pill/segment (p9 chips and option rows). */
export function Choice({
  label,
  selected,
  onPress,
  left,
  style,
  textStyle,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  left?: ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, selected ? styles.choiceOn : null, disabled ? styles.choiceOff : null, style]}
    >
      {left}
      <Text style={[bodyFont(16, '800'), { color: selected ? colors.white : disabled ? colors.inkMuted : colors.ink }, textStyle]}>{label}</Text>
    </Pressable>
  );
}

/** Progress bar whose fill animates to each new value on the UI thread (item 4). */
export function ProgressBar({ value, color = colors.mouse, track = colors.lavender, height = 10 }: { value: number; color?: string; track?: string; height?: number }) {
  const reduced = useReducedMotion();
  const target = Math.max(0, Math.min(1, value));
  const w = useSharedValue(reduced ? target : 0);
  useEffect(() => {
    w.value = reduced ? target : withTiming(target, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [target, reduced, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={[{ height, borderRadius: height, backgroundColor: color, overflow: 'hidden' }, fill]}>
        {/* Glossy highlight stripe (game-style bars). */}
        {height >= 10 ? (
          <View style={{ position: 'absolute', top: height * 0.2, left: height * 0.45, right: height * 0.45, height: Math.max(2, height * 0.24), borderRadius: height, backgroundColor: 'rgba(255,255,255,0.38)' }} />
        ) : null}
      </Animated.View>
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={[bodyFont(14, '600'), { color: colors.wrong }]}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[bodyFont(14), { color: colors.inkSoft, lineHeight: 21 }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderBottomWidth: 5,
    borderColor: colors.border,
    padding: 18,
  },
  section: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 18,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 2, borderBottomWidth: 4,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  choiceOn: { backgroundColor: colors.primary, borderColor: colors.primary, borderBottomColor: colors.primaryDark },
  choiceOff: { backgroundColor: colors.track, borderColor: colors.track, borderStyle: 'dashed' },
});
