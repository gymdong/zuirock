import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme';

/**
 * Melting-cheese edge hung under a card (치즈 마을). Place it as the last child of a card with
 * `overflow: 'visible'`; it overlaps the card's bottom edge and drips below it.
 */
export function Drip({ color = colors.cheese, height = 18, style }: { color?: string; height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', left: 14, right: 14, bottom: -height + 4, height }, style]}>
      <Svg width="100%" height={height} viewBox="0 0 100 18" preserveAspectRatio="none">
        <Path
          d="M0 0 H100 V4 C96 4 95 9 92 9 C89 9 89 4 85 4 C80 4 81 15 76 15 C71 15 72 4 66 4 C61 4 62 8 58 8 C54 8 55 4 49 4 C44 4 45 12 40 12 C35 12 36 4 30 4 C26 4 26 7 22 7 C18 7 19 4 14 4 C9 4 10 11 6 11 C2 11 3 4 0 4 Z"
          fill={color}
        />
      </Svg>
    </View>
  );
}

/**
 * Cheese poured over the top of a card: a cheese band with drips, clipped to the card's rounded top.
 * Give the card ~12 px extra top padding so the drips don't cover its first line.
 */
export function CheeseCap({ radius = 22, color = colors.cheese, height = 22 }: { radius?: number; color?: string; height?: number }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height, borderTopLeftRadius: radius - 2, borderTopRightRadius: radius - 2, overflow: 'hidden' }}
    >
      <Svg width="100%" height={height} viewBox="0 0 100 22" preserveAspectRatio="none">
        <Path
          d="M0 0 H100 V8 C97 8 96 14 93 14 C90 14 90 8 86 8 C81 8 82 20 77 20 C72 20 73 8 67 8 C62 8 63 12 59 12 C55 12 56 8 50 8 C45 8 46 17 41 17 C36 17 37 8 31 8 C27 8 27 11 23 11 C19 11 20 8 15 8 C10 8 11 16 7 16 C3 16 4 8 0 8 Z"
          fill={color}
        />
      </Svg>
    </View>
  );
}
