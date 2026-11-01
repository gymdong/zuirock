import { ITEM_SLOTS, type EquippedItems, type ItemDto, type ItemSlot } from '@zuirock/shared';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { assetUrl } from '../lib/config';
import { bodyFont, colors } from '../theme';
import { Mascot } from './Mascot';

/**
 * Where each slot's art lands on the mascot: [x, y, w, h] in body.png coordinates (855×764). The item image is
 * fitted into its box, so art drawn at the box's aspect ratio sits exactly (scripts/gen-placeholder-items.ts).
 */
const BODY_W = 855;
const PLACEMENT: Record<ItemSlot, [number, number, number, number]> = {
  head: [250, 15, 220, 150],
  eyes: [92, 285, 298, 225],
  nose: [196, 487, 76, 61],
  shoes: [85, 650, 285, 114],
  tail: [640, 480, 215, 160],
};
/** Paint order in front of the body; the tail goes behind it. */
const OVER: ItemSlot[] = ['shoes', 'eyes', 'nose', 'head'];

function itemFrame(slot: ItemSlot, size: number) {
  const s = size / BODY_W;
  const [x, y, w, h] = PLACEMENT[slot];
  return { position: 'absolute' as const, left: x * s, top: y * s, width: w * s, height: h * s };
}

/**
 * Character = base body + one image per slot (AC-G8). Eyes, nose and tail items replace the mascot's own
 * layer. Item art is replaceable data (AC-G9): an item without an image shows its name tag instead.
 */
export function CharacterLayers({ equipped, items, size = 200 }: { equipped: EquippedItems; items: ItemDto[]; size?: number }) {
  const worn = ITEM_SLOTS.map((slot) => items.find((i) => i.id === equipped[slot] && i.slot === slot)).filter((i): i is ItemDto => !!i);
  const drawn = worn.filter((it) => !!it.imageUrl);
  const layer = (it: ItemDto) => <Image key={it.id} source={{ uri: assetUrl(it.imageUrl)! }} style={itemFrame(it.slot, size)} resizeMode="contain" />;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Mascot
        size={size}
        without={(['eyes', 'nose', 'tail'] as const).filter((p) => drawn.some((it) => it.slot === p))}
        under={drawn.filter((it) => it.slot === 'tail').map(layer)}
        over={OVER.flatMap((slot) => drawn.filter((it) => it.slot === slot)).map(layer)}
      />
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
