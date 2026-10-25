import { ITEM_SLOTS, type EquippedItems, type ItemDto, type ItemSlot } from '@zuirock/shared';
import { Image, StyleSheet, Text, View } from 'react-native';
import { assetUrl } from '../lib/config';
import { bodyFont, colors } from '../theme';
import { Mascot } from './Mascot';

/**
 * TEMPORARY placement for the placeholder item shapes (256×256 art, one block per slot).
 * `art` = where the shape sits inside its 256×256 image; `to` = where it should land on the new
 * mascot, in body.png coordinates (855×764). Real item art made for the Figma character can ship as
 * full-canvas overlays and replace this mapping.
 */
const BODY_W = 855;
const BODY_H = 764;
const PLACEMENT: Record<ItemSlot, { art: [number, number, number, number]; to: [number, number, number, number] }> = {
  hat: { art: [50, 40, 207, 101], to: [222, 70, 285, 150] },
  top: { art: [40, 100, 217, 191], to: [130, 555, 310, 160] },
  bottom: { art: [75, 180, 182, 246], to: [190, 650, 200, 80] },
  shoes: { art: [60, 220, 197, 251], to: [85, 690, 280, 70] },
  accessory: { art: [90, 95, 167, 151], to: [470, 540, 130, 95] },
};

/** Absolute style that scales an item image so its drawn shape fills the slot's target box. */
function itemFrame(slot: ItemSlot, size: number) {
  const { art, to } = PLACEMENT[slot];
  const [x0, y0, x1, y1] = art;
  const [tx, ty, tw, th] = to;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const k = Math.min(tw / bw, th / bh); // body units per image pixel
  const s = size / BODY_W;
  const oy = (size - BODY_H * s) / 2;
  return {
    position: 'absolute' as const,
    left: (tx + (tw - bw * k) / 2 - x0 * k) * s,
    top: oy + (ty + (th - bh * k) / 2 - y0 * k) * s,
    width: 256 * k * s,
    height: 256 * k * s,
  };
}

/**
 * Character = base body + one image per slot, stacked in slot order (AC-G8). Item art is
 * replaceable data (AC-G9): an item without an image shows its name tag instead.
 */
export function CharacterLayers({ equipped, items, size = 200 }: { equipped: EquippedItems; items: ItemDto[]; size?: number }) {
  const worn = ITEM_SLOTS.map((slot) => items.find((i) => i.id === equipped[slot])).filter((i): i is ItemDto => !!i);
  const slotOf = (it: ItemDto) => it.slot as ItemSlot;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Mascot size={size} />
      {worn.map((it) =>
        it.imageUrl ? (
          <Image key={it.id} source={{ uri: assetUrl(it.imageUrl)! }} style={itemFrame(slotOf(it), size)} resizeMode="stretch" />
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
