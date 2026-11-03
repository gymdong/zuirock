import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { Bob, Twinkle } from './motion';
import { colors, MAX_CONTENT_WIDTH } from '../theme';

/** 장식을 그릴 만큼 양옆이 넓을 때만 보인다(가로 iPad·노트북). 폰에서는 null. */
const MIN_GUTTER = 120;

/**
 * 화면이 앱 열(MAX_CONTENT_WIDTH)보다 넓으면 양옆 빈 곳을 앱 배경과 마스코트로 채운다.
 * 터치를 받지 않는 장식이라 게임 화면 위에 얹어도 조작에 영향이 없다.
 */
export function WideSides() {
  const { width, height } = useWindowDimensions();
  const gutter = (width - MAX_CONTENT_WIDTH) / 2;
  if (gutter < MIN_GUTTER) return null;
  const mascot = Math.min(gutter - 56, height * 0.42, 300);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Side width={gutter} side="left" mascot={mascot} mood="surprised" />
      <Side width={gutter} side="right" mascot={mascot} mood="glasses" />
    </View>
  );
}

function Side({ width, side, mascot, mood }: { width: number; side: 'left' | 'right'; mascot: number; mood: 'surprised' | 'glasses' }) {
  const left = side === 'left';
  return (
    <View style={[styles.side, { width }, left ? { left: 0, borderRightWidth: 2 } : { right: 0, borderLeftWidth: 2 }]}>
      <Twinkle style={{ top: '12%', left: '20%' }} size={9} color={colors.cheese} />
      <Twinkle style={{ top: '26%', right: '16%' }} size={7} delay={400} color={colors.mouse} />
      <Twinkle style={{ bottom: '22%', left: '14%' }} size={8} delay={800} color={colors.ear} />
      <Twinkle style={{ bottom: '10%', right: '22%' }} size={10} delay={1200} color={colors.cheese} />
      <Bob distance={8}>
        <Mascot size={mascot} mood={mood} motion="idle" finished />
      </Bob>
      <View style={styles.cheeseRow}>
        <Icon name="cheese" size={Math.max(28, mascot / 6)} />
        <Icon name="cheese" size={Math.max(20, mascot / 8)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  side: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    backgroundColor: colors.lavender,
    borderColor: colors.lavenderStrong,
  },
  cheeseRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
});
