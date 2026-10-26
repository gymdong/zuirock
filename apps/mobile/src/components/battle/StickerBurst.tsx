import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { useRoom } from '../../state/room';
import { bodyFont, colors } from '../../theme';
import { FloatUp } from '../motion';
import { Sticker } from './Sticker';

const SHOW_MS = 2200;

/** Stickers sent in the room float up over the screen for ~2 s (everyone sees them, sender included). */
export function StickerBurst() {
  const { stickers } = useRoom();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (stickers.length === 0) return;
    const t = setTimeout(() => setNow(Date.now()), SHOW_MS + 50);
    setNow(Date.now());
    return () => clearTimeout(t);
  }, [stickers]);
  // Local receive time keeps the animation independent of server clock skew.
  const live = stickers.filter((s) => (received.get(s.id) ?? mark(s.id)) > now - SHOW_MS);
  return (
    <View pointerEvents="none" style={styles.layer}>
      {live.map((s, i) => (
        <Animated.View
          key={s.id}
          entering={ZoomIn.springify().damping(9).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(200)}
          style={[styles.item, { left: `${12 + ((i * 29) % 70)}%` }]}
        >
          <FloatUp>
            <View style={{ alignItems: 'center' }}>
              <Sticker id={s.sticker} size={78} />
              <Text style={[bodyFont(12, '800'), styles.name]} numberOfLines={1}>
                {s.nickname}
              </Text>
            </View>
          </FloatUp>
        </Animated.View>
      ))}
    </View>
  );
}

const received = new Map<string, number>();
function mark(id: string): number {
  const t = Date.now();
  received.set(id, t);
  if (received.size > 200) received.clear();
  return t;
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 },
  item: { position: 'absolute', bottom: '28%' },
  name: { color: colors.white, backgroundColor: colors.primary, borderRadius: 8, overflow: 'hidden', paddingHorizontal: 6, marginTop: 2 },
});
