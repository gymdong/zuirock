import { useEffect, useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme';

/**
 * Shared motion primitives. Everything runs on the UI thread (Reanimated shared values; no
 * per-frame JS) and collapses to the final state when the system "reduce motion" setting is on.
 */

/** Gentle up-down bob (home mascot idle). */
export function Bob({ children, distance = 4 }: { children: ReactNode; distance?: number }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    y.value = withRepeat(withSequence(withTiming(-distance, { duration: 1100, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) })), -1);
  }, [reduced, distance, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Repeating heartbeat while `active` (urgent timer). */
export function Pulse({ active, children, style }: { active: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = active && !reduced ? withRepeat(withSequence(withTiming(1.12, { duration: 180 }), withTiming(1, { duration: 320 })), -1) : withTiming(1, { duration: 120 });
  }, [active, reduced, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Horizontal shake each time `trigger` changes (wrong answer). */
export function Shake({ trigger, children, style }: { trigger: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (!trigger || reduced) return;
    x.value = withSequence(...[-10, 10, -8, 8, -4, 0].map((v) => withTiming(v, { duration: 50 })));
  }, [trigger, reduced, x]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Scale pop each time `trigger` changes (own score chip, chosung boxes). */
export function Pop({ trigger, children, style }: { trigger: number | string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    s.value = withSequence(withTiming(1.12, { duration: 140 }), withTiming(1, { duration: 220 }));
  }, [trigger, reduced, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Floating "+N" that rises and fades (correct answer). Remount (key) to replay. */
export function FloatUp({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: reduced ? 0 : 1100, easing: Easing.out(Easing.cubic) });
  }, [reduced, p]);
  const anim = useAnimatedStyle(() => ({
    opacity: p.value < 0.7 ? 1 : 1 - (p.value - 0.7) / 0.3,
    transform: [{ translateY: -60 * p.value }, { scale: 0.8 + 0.4 * Math.min(1, p.value * 3) }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.float, style, anim]}>
      {children}
    </Animated.View>
  );
}

const CONFETTI_COLORS = [colors.cheese, colors.mouse, colors.ear, colors.correct, colors.primary, colors.wrong];

function Piece({ dx, dy, rot, color, delay, size }: { dx: number; dy: number; rot: number; color: string; delay: number; size: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) }));
  }, [delay, p]);
  const anim = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : 1 - Math.max(0, p.value - 0.6) / 0.4,
    // Burst outwards, then gravity pulls the piece down.
    transform: [{ translateX: dx * p.value }, { translateY: dy * p.value + 220 * p.value * p.value }, { rotate: `${rot * p.value}deg` }],
  }));
  return <Animated.View style={[{ position: 'absolute', width: size, height: size * 0.6, borderRadius: 2, backgroundColor: color }, anim]} />;
}

/** Confetti burst from the center of its box. Remount (key) to replay; renders nothing with reduced motion. */
export function Confetti({ count = 24, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed = 90 + Math.random() * 110;
        return {
          dx: Math.cos(angle) * speed,
          dy: Math.sin(angle) * speed - 120,
          rot: (Math.random() - 0.5) * 720,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
          delay: Math.random() * 120,
          size: 8 + Math.random() * 6,
        };
      }),
    [count],
  );
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={[styles.confetti, style]}>
      {pieces.map((p, i) => (
        <Piece key={i} {...p} />
      ))}
    </View>
  );
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Number that counts up to `value` on the UI thread (XP, cheese, score). Uses a read-only
 * TextInput whose text is an animated prop, so no React re-render per frame.
 */
export function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  duration = 900,
  style,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  style?: StyleProp<TextStyle>;
}) {
  const reduced = useReducedMotion();
  const n = useSharedValue(reduced ? value : 0);
  useEffect(() => {
    n.value = reduced ? value : withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
  }, [value, reduced, duration, n]);
  const animatedProps = useAnimatedProps(() => {
    const text = `${prefix}${Math.round(n.value)}${suffix}`;
    return { text, defaultValue: text } as never;
  });
  return (
    <AnimatedTextInput
      editable={false}
      underlineColorAndroid="transparent"
      defaultValue={`${prefix}${reduced ? value : 0}${suffix}`}
      animatedProps={animatedProps}
      accessibilityLabel={`${prefix}${value}${suffix}`}
      style={[{ padding: 0, margin: 0, textAlign: 'center' }, style]}
    />
  );
}

/** Pulsing grey block while data loads. */
export function Skeleton({ height = 20, width = '100%', radius = 12, style }: { height?: number; width?: ViewStyle['width']; radius?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(0.55);
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0.55, { duration: 650 })), -1);
  }, [reduced, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: colors.track }, style, anim]} />;
}

const styles = StyleSheet.create({
  float: { position: 'absolute', alignSelf: 'center', top: -10, zIndex: 10 },
  confetti: { position: 'absolute', left: '50%', top: '40%', width: 0, height: 0, zIndex: 20 },
});

/** Pressable that shrinks slightly while held (tiles, cards). Plain style function: layout styles pass through untouched. */
export function PressScale({
  children,
  onPress,
  style,
  to = 0.95,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  to?: number;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [style, pressed ? { transform: [{ scale: to }] } : null]}
    >
      {children}
    </Pressable>
  );
}

/** Soft expanding ring behind its children (current stage, main call-to-action). */
export function Ripple({ color = colors.primary, size, children }: { color?: string; size: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.out(Easing.quad) }), -1);
  }, [reduced, t]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - t.value), transform: [{ scale: 1 + t.value * 0.55 }] }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {reduced ? null : <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, ring]} />}
      {children}
    </View>
  );
}

/** Twinkling dot used as background decoration. */
export function Twinkle({ delay = 0, size = 8, color = '#FFFFFF', style }: { delay?: number; size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(reduced ? 0.5 : 0.15);
  useEffect(() => {
    if (reduced) return;
    o.value = withDelay(delay, withRepeat(withSequence(withTiming(0.9, { duration: 900 }), withTiming(0.15, { duration: 900 })), -1));
  }, [reduced, delay, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style, anim]} />;
}

/** Staggered rise-in for list sections; `i` is the position (each step waits `step` ms more). */
export function Rise({ i, children, step = 70, style }: { i: number; children: ReactNode; step?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(i, 10) * step).duration(320).reduceMotion(ReduceMotion.System)} style={style}>
      {children}
    </Animated.View>
  );
}
