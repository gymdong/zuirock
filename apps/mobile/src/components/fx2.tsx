import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { colors } from '../theme';

/**
 * More game feel (11/1): small reactions layered on top of the existing motion/fx toolkit.
 * UI-thread only, and each one collapses to nothing with the system "reduce motion" setting.
 */

/** Brief coral wash over the whole screen each time `trigger` changes to a non-zero value (wrong answer). */
export function WrongFlash({ trigger }: { trigger: number }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(0);
  useEffect(() => {
    if (!trigger || reduced) return;
    o.value = withSequence(withTiming(0.2, { duration: 90 }), withTiming(0, { duration: 320 }));
  }, [trigger, reduced, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.wrong }, anim]} />;
}

/**
 * A soft diagonal light sweeping once across its parent (progress bar, result card). The parent needs a
 * border radius; this clips itself. Set `active` to play it; it replays when `active` turns true again.
 */
export function Shine({ active = true, delay = 0, duration = 850, radius = 0 }: { active?: boolean; delay?: number; duration?: number; radius?: number }) {
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const p = useSharedValue(0);
  useEffect(() => {
    if (!active || reduced || w === 0) return;
    p.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }));
  }, [active, reduced, w, delay, duration, p]);
  const bar = useAnimatedStyle(() => ({
    opacity: p.value === 0 || p.value === 1 ? 0 : 1,
    transform: [{ translateX: -60 + (w + 120) * p.value }, { rotate: '18deg' }],
  }));
  if (reduced || !active) return null;
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  return (
    <Animated.View pointerEvents="none" onLayout={onLayout} style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: radius }]}>
      <Animated.View style={[{ position: 'absolute', top: -30, bottom: -30, width: 34, backgroundColor: 'rgba(255,255,255,0.5)' }, bar]} />
    </Animated.View>
  );
}

/** One-shot "look here" bump when it mounts (my row in a list). */
export function HighlightPulse({ children, delay = 500, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    s.value = withDelay(delay, withSequence(withTiming(1.035, { duration: 180, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 260 }), withTiming(1.02, { duration: 140 }), withTiming(1, { duration: 200 })));
  }, [reduced, delay, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}
