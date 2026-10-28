import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { emit } from '../lib/events';
import { bodyFont, colors, titleFont } from '../theme';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { Bob, PressScale, Ripple } from './motion';

const ROW = 84;
const SWING = 74;
const CURRENT = 84;
const NODE = 56;

interface Props {
  level: number;
  max: number;
  completed?: boolean;
  /** Called when the current stage node is tapped. */
  onStart: () => void;
}

/** Levels shown on the road: a few cleared behind, the rest up to the next checkpoint (5, 10, …). */
export function stageWindow(level: number, max: number): number[] {
  const checkpoint = Math.min(max, Math.floor(level / 5) * 5 + 5);
  const top = Math.min(checkpoint, level + 4);
  const bottom = Math.max(1, level - 2);
  const out: number[] = [];
  for (let n = top; n >= bottom; n--) out.push(n);
  return out;
}

/** Winding stage road, top = far, bottom = where you are. Cleared = mint, current = glowing, ahead = locked. */
export function StageMap({ level, max, completed, onStart }: Props) {
  const levels = stageWindow(level, max);
  const [width, setWidth] = useState(320);
  const cx = (i: number) => width / 2 + Math.sin((levels[i]! + 1) * 1.15) * SWING;
  const cy = (i: number) => i * ROW + ROW / 2;
  const height = levels.length * ROW;

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {levels.slice(0, -1).map((_, i) => {
        // Dots between node i (further) and i+1 (nearer); mint when the nearer node is already cleared.
        const near = levels[i + 1]!;
        const done = completed || near < level;
        return [0.3, 0.5, 0.7].map((f) => (
          <View
            key={`${i}-${f}`}
            style={[
              styles.dot,
              { left: cx(i) + (cx(i + 1) - cx(i)) * f - 5, top: cy(i) + (cy(i + 1) - cy(i)) * f - 5, backgroundColor: done ? colors.cheeseDark : colors.track },
            ]}
          />
        ));
      })}
      {levels.map((n, i) => {
        const isCurrent = !completed && n === level;
        const cleared = completed || n < level;
        // Every 5th stage: basic-test checkpoint and the 'good' reward chest.
        const checkpoint = n % 5 === 0;
        const size = isCurrent ? CURRENT : checkpoint ? 64 : NODE;
        return (
          <Animated.View
            key={n}
            entering={FadeInDown.delay(Math.min(i, 8) * 55).duration(260).reduceMotion(ReduceMotion.System)}
            style={[styles.nodeBox, { left: cx(i) - 60, top: cy(i) - ROW / 2 }]}
          >
            {isCurrent ? (
              <View style={styles.mascot}>
                <Bob distance={5}>
                  <Mascot size={46} mood="happy" />
                </Bob>
              </View>
            ) : null}
            {isCurrent ? (
              <PressScale
                accessibilityLabel={`${n}레벨 도전`}
                onPress={() => {
                  emit('tap');
                  onStart();
                }}
                to={0.92}
              >
                <Ripple size={CURRENT + 14} color={colors.mouse}>
                  <View style={[styles.node, styles.current, { width: CURRENT, height: CURRENT, borderRadius: CURRENT / 2 }]}>
                    <Text style={[titleFont(30), { color: colors.white }]}>{n}</Text>
                  </View>
                </Ripple>
              </PressScale>
            ) : (
              <View
                style={[
                  styles.node,
                  { width: size, height: size, borderRadius: size / 2 },
                  cleared ? styles.cleared : checkpoint ? styles.flag : styles.locked,
                ]}
              >
                {cleared ? (
                  <Icon name="check" size={26} color={colors.ink} />
                ) : checkpoint ? (
                  <Icon name="star" size={28} color={colors.ink} filled />
                ) : (
                  <Text style={[titleFont(20), { color: colors.inkMuted }]}>{n}</Text>
                )}
              </View>
            )}
            {checkpoint && !isCurrent ? <Text style={[bodyFont(13, '800'), styles.label]}>{cleared ? `Lv.${n}` : `Lv.${n} 체크포인트`}</Text> : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  nodeBox: { position: 'absolute', width: 120, height: ROW, alignItems: 'center', justifyContent: 'center' },
  node: { alignItems: 'center', justifyContent: 'center' },
  current: { backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.ink, borderBottomWidth: 8 },
  cleared: { backgroundColor: colors.cheese, borderBottomWidth: 6, borderBottomColor: colors.crust },
  locked: { backgroundColor: colors.white, borderWidth: 2, borderColor: colors.borderDark, borderBottomWidth: 5 },
  flag: { backgroundColor: colors.cheese, borderBottomWidth: 6, borderBottomColor: colors.cheeseDark },
  mascot: { position: 'absolute', top: -30, zIndex: 2 },
  label: { position: 'absolute', bottom: -6, color: colors.cheeseText },
});
