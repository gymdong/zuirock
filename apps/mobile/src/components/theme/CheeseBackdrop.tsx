import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Ellipse } from 'react-native-svg';
import { colors } from '../../theme';

/** Cheese holes scattered over a 100 × 200 tile (x, y, rx, ry). Hand-placed so they never look like a grid. */
const HOLES: Array<[number, number, number, number]> = [
  [12, 14, 7, 6], [78, 9, 4, 3.5], [55, 34, 9, 7.5], [8, 58, 4, 3.5], [88, 52, 8, 7],
  [36, 76, 5, 4.5], [70, 96, 10, 8.5], [18, 112, 8, 7], [92, 128, 4, 3.5], [48, 140, 6, 5],
  [10, 166, 5, 4], [76, 172, 7, 6], [40, 192, 4, 3.5],
];

/**
 * 치즈 마을 바탕: soft cheese holes behind every screen, drifting very slowly (static with reduce motion).
 * Two stacked tiles scroll by one tile height so the loop is seamless.
 */
export function CheeseBackdrop() {
  const reduced = useReducedMotion();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    y.value = withRepeat(withTiming(1, { duration: 60_000, easing: Easing.linear }), -1, false);
  }, [reduced, y]);
  // Pixels (not %): percentage transforms are not reliable on every native target. One loop = one tile.
  const drift = useAnimatedStyle(() => ({ transform: [{ translateY: -TILE_H * y.value }] }));
  // Phone-sized tiles repeated over the screen, so holes keep their size on wide web viewports too.
  const cols = Math.max(1, Math.ceil(box.w / TILE_W));
  const rows = Math.max(1, Math.ceil(box.h / TILE_H)) + 1;
  const k = TILE_W / 100;
  return (
    <View pointerEvents="none" style={styles.clip} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {box.w > 0 ? (
        <Animated.View style={[styles.strip, drift]}>
          <Svg width={cols * TILE_W} height={rows * TILE_H}>
            {Array.from({ length: cols * rows }, (_, t) =>
              HOLES.map(([cx, cy, rx, ry], i) => (
                <Ellipse
                  key={`${t}-${i}`}
                  cx={(t % cols) * TILE_W + cx * k}
                  cy={Math.floor(t / cols) * TILE_H + cy * k}
                  rx={rx * k * 0.8}
                  ry={ry * k * 0.8}
                  fill={colors.cheeseHole}
                  opacity={0.45}
                />
              )),
            )}
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** One tile = 100 × 200 design units drawn at phone width. */
const TILE_W = 390;
const TILE_H = 780;

const styles = StyleSheet.create({
  clip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  strip: { position: 'absolute', top: 0, left: 0, right: 0 },
});
