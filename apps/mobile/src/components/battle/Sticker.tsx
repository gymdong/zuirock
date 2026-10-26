import type { StickerId } from '@zuirock/shared';
import { StyleSheet, Text, View } from 'react-native';
import { bodyFont, colors } from '../../theme';
import { Mascot, type MascotMood } from '../Mascot';

/**
 * TEMPORARY sticker art: the mascot in a mood plus a speech bubble. When real sticker images arrive,
 * add `image` per id and render it instead (ids are the contract with the server).
 */
export const STICKER_ART: Record<StickerId, { mood: MascotMood; caption: string; crown?: boolean }> = {
  yay: { mood: 'happy', caption: '좋아!' },
  wow: { mood: 'surprised', caption: '헉!' },
  lol: { mood: 'happy', caption: 'ㅋㅋㅋ' },
  hmm: { mood: 'glasses', caption: '흠…' },
  cheese: { mood: 'smile', caption: '치즈!', crown: true },
  clap: { mood: 'happy', caption: '천재?' },
};

export function Sticker({ id, size = 56 }: { id: StickerId; size?: number }) {
  const art = STICKER_ART[id];
  return (
    <View style={{ alignItems: 'center', width: size + 10 }}>
      <View style={[styles.bubble, { maxWidth: size + 20 }]}>
        <Text style={[bodyFont(Math.max(11, Math.round(size / 4.5)), '800'), { color: colors.ink }]} numberOfLines={1}>
          {art.caption}
        </Text>
      </View>
      <Mascot size={size} mood={art.mood} crown={art.crown} blink={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 2,
    borderBottomWidth: 3,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginBottom: -4,
    zIndex: 1,
  },
});
