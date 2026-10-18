import { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { snapToStep } from '../lib/battleTimer';
import { emit } from '../lib/events';
import { colors } from '../theme';

interface Props {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
}

/**
 * Stepped slider for web and native without extra dependencies: the track is the responder and
 * maps the touch x to a snapped value. Supports screen-reader increment/decrement.
 */
export function Slider({ value, min, max, step, onChange, accessibilityLabel }: Props) {
  const [width, setWidth] = useState(0);
  const last = useRef(value);
  const ratio = (value - min) / (max - min);

  const update = (e: GestureResponderEvent) => {
    if (width <= 0) return;
    const next = snapToStep(e.nativeEvent.locationX / width, min, max, step);
    if (next !== last.current) {
      last.current = next;
      emit('tap');
      onChange(next);
    }
  };
  const nudge = (dir: 1 | -1) => onChange(Math.min(max, Math.max(min, value + dir * step)));

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={update}
      onResponderMove={update}
      style={styles.hit}
      testID={`slider-${accessibilityLabel}`}
    >
      <View pointerEvents="none" style={styles.track}>
        <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: `${ratio * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 40, justifyContent: 'center' },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
  thumb: {
    position: 'absolute',
    width: 26,
    height: 26,
    marginLeft: -13,
    borderRadius: 13,
    backgroundColor: colors.primary,
    borderWidth: 4,
    borderColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
