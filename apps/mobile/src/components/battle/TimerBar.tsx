import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { URGENT_SEC } from '../../lib/battleTimer';
import { bodyFont, colors } from '../../theme';

interface Props {
  limitSec: number;
  /** Server-clock ms left when this mounted/changed; the bar drains linearly on the UI thread. */
  remainingMs: number;
  /** Reveal at N seconds REMAINING (null = 힌트 없음). */
  revealN: number | null;
  /** Question identity; restarts the drain. */
  runKey: string;
  running: boolean;
}

/**
 * Remaining-time bar (D-R2-1): full at the start, empty at the deadline, turning coral in the
 * last 10 seconds. The hint marker sits at N/limit — when the bar's edge reaches it, N seconds remain.
 */
export function TimerBar({ limitSec, remainingMs, revealN, runKey, running }: Props) {
  const reduced = useReducedMotion();
  const limitMs = limitSec * 1000;
  const p = useSharedValue(Math.min(1, remainingMs / limitMs));
  useEffect(() => {
    const start = Math.max(0, Math.min(1, remainingMs / limitMs));
    p.value = start;
    // Linear drain is the timer itself, so it runs even with reduced motion.
    if (running) p.value = withTiming(0, { duration: Math.max(0, remainingMs), easing: Easing.linear });
  }, [runKey, running]);
  const urgentAt = URGENT_SEC / limitSec;
  const fill = useAnimatedStyle(() => ({
    width: `${p.value * 100}%`,
    backgroundColor: reduced
      ? p.value <= urgentAt ? colors.wrong : colors.mouse
      : interpolateColor(p.value, [urgentAt * 0.9, urgentAt * 1.1], [colors.wrong, colors.mouse]),
  }));
  const markerLeft = revealN != null ? `${(revealN / limitSec) * 100}%` : null;
  return (
    <View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fill]} />
      </View>
      {markerLeft ? <View style={[styles.marker, { left: markerLeft as `${number}%` }]} /> : null}
      <View style={styles.labels}>
        <Text style={[bodyFont(13, '700'), { color: colors.inkSoft }]}>0초</Text>
        <Text style={[bodyFont(13, '700'), { color: colors.inkSoft }]}>
          {revealN != null ? <Text style={{ color: colors.cheeseText }}>남은 {revealN}초 초성 공개   </Text> : null}
          {limitSec}초
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 12, borderRadius: 6, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 12, borderRadius: 6 },
  marker: { position: 'absolute', top: -5, width: 5, height: 22, borderRadius: 3, backgroundColor: colors.cheeseDark, marginLeft: -2 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
});
