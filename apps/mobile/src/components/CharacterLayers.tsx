import { ITEM_SLOTS, type EquippedItems, type ItemDto } from '@zuirock/shared';
import { Image, StyleSheet, Text, View } from 'react-native';
import { assetUrl } from '../lib/config';
import { bodyFont, colors } from '../theme';
import { Mascot } from './Mascot';

/**
 * Character = base body + one image per slot, stacked in slot order (AC-G8). Item art is
 * replaceable data (AC-G9): an item without an image shows its name tag instead.
 */
export function CharacterLayers({ equipped, items, size = 200 }: { equipped: EquippedItems; items: ItemDto[]; size?: number }) {
  const worn = ITEM_SLOTS.map((slot) => items.find((i) => i.id === equipped[slot])).filter((i): i is ItemDto => !!i);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Mascot size={size} />
      {worn.map((it) =>
        it.imageUrl ? (
          <Image key={it.id} source={{ uri: assetUrl(it.imageUrl)! }} style={[StyleSheet.absoluteFill, { width: size, height: size }]} resizeMode="contain" />
        ) : null,
      )}
      <View style={styles.tags}>
        {worn
          .filter((it) => !it.imageUrl)
          .map((it) => (
            <Text key={it.id} style={[bodyFont(12, '800'), styles.tag]}>
              {it.name}
            </Text>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tags: { position: 'absolute', bottom: 0, flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center' },
  tag: { backgroundColor: colors.cheese, color: colors.ink, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
});
