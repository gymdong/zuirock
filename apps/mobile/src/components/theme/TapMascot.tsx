import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { emit } from '../../lib/events';
import { bodyFont, colors } from '../../theme';
import { Mascot, type MascotMood } from '../Mascot';

const LINES: Array<{ text: string; mood: MascotMood }> = [
  { text: '치즈 줘!', mood: 'happy' },
  { text: '뇌 운동 하자!', mood: 'smile' },
  { text: '간지러워~', mood: 'happy' },
  { text: '오늘도 한 판?', mood: 'glasses' },
  { text: '깜짝이야!', mood: 'surprised' },
];

/** The mouse reacts when tapped: a squishy hop and a one-line speech bubble (치즈 마을 personality). */
export function TapMascot({ size = 120, mood = 'smile', crown }: { size?: number; mood?: MascotMood; crown?: boolean }) {
  const reduced = useReducedMotion();
  const [line, setLine] = useState<(typeof LINES)[number] | null>(null);
  const hop = useSharedValue(0);
  const squash = useSharedValue(1);
  useEffect(() => {
    if (!line) return;
    const t = setTimeout(() => setLine(null), 1600);
    return () => clearTimeout(t);
  }, [line]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: hop.value }, { scaleY: squash.value }, { scaleX: 2 - squash.value }] }));
  const onPress = () => {
    emit('tap');
    setLine(LINES[Math.floor(Math.random() * LINES.length)]!);
    if (reduced) return;
    squash.value = withSequence(withTiming(0.82, { duration: 90 }), withSpring(1, { damping: 5, stiffness: 300 }));
    hop.value = withSequence(withTiming(-size * 0.22, { duration: 160 }), withSpring(0, { damping: 6, stiffness: 220 }));
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="쥐 쓰다듬기" onPress={onPress} style={{ alignItems: 'center' }}>
      {line ? (
        <Animated.View entering={FadeIn.duration(120).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(160)} style={[styles.bubble, { top: -size * 0.3 }]}>
          <Text style={[bodyFont(15, '800'), { color: colors.ink }]}>{line.text}</Text>
        </Animated.View>
      ) : null}
      <Animated.View style={anim}>
        <Mascot size={size} mood={line?.mood ?? mood} crown={crown} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    zIndex: 2,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
});
