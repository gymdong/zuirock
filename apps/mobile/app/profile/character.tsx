import { ITEM_SLOTS, type EquippedItems, type ItemSlot } from '@zuirock/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../../src/api/client';
import { Api } from '../../src/api/endpoints';
import { Button } from '../../src/components/Button';
import { CharacterLayers } from '../../src/components/CharacterLayers';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { Card, Choice, ErrorText, Muted, Tag } from '../../src/components/ui';
import { assetUrl } from '../../src/lib/config';
import { useAsync } from '../../src/lib/useAsync';
import { useSession } from '../../src/state/session';
import { bodyFont, colors, radius, titleFont } from '../../src/theme';

const SLOT_LABEL: Record<ItemSlot, string> = { hat: '모자', top: '상의', bottom: '하의', shoes: '신발', accessory: '소품' };

/** p15 캐릭터 꾸미기: try anything on, buy with cheese, save only owned items. */
export default function Character() {
  const router = useRouter();
  const level = useSession().member?.user.level.level ?? 1;
  const wardrobe = useAsync(() => Api.wardrobe(), []);
  const [slot, setSlot] = useState<ItemSlot>('hat');
  const [preview, setPreview] = useState<EquippedItems>({});
  const [cheese, setCheese] = useState(0);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const w = wardrobe.data;

  useEffect(() => {
    if (!w) return;
    setPreview(w.equipped);
    setCheese(w.cheese);
    setOwned(new Set(w.items.filter((i) => i.owned).map((i) => i.id)));
  }, [w]);

  const items = (w?.items ?? []).filter((i) => i.slot === slot);
  const unowned = Object.values(preview).filter((id) => id && !owned.has(id));

  const buy = async (itemId: string) => {
    setError(null);
    try {
      const r = await Api.purchaseItem(itemId);
      setCheese(r.cheese);
      setOwned(new Set([...owned, itemId]));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await Api.equip(preview);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="캐릭터 꾸미기"
      right={
        <View style={styles.cheese}>
          <Icon name="cheese" size={16} color={colors.cheese} />
          <Text style={[titleFont(17), { color: colors.ink }]}>{cheese}</Text>
        </View>
      }
      footer={
        <>
          <ErrorText>{error ?? (unowned.length ? '아직 없는 아이템은 입어 보기만 할 수 있어요' : null)}</ErrorText>
          <Button label="이대로 저장" onPress={save} loading={busy} disabled={!w || unowned.length > 0} />
        </>
      }
    >
      <ErrorText>{wardrobe.error}</ErrorText>
      <Card style={{ alignItems: 'center', backgroundColor: colors.lavender, borderColor: colors.lavender }}>
        <CharacterLayers equipped={preview} items={w?.items ?? []} size={200} />
      </Card>
      <View style={styles.slots}>
        {ITEM_SLOTS.map((s) => (
          <Choice key={s} label={SLOT_LABEL[s]} selected={slot === s} onPress={() => setSlot(s)} style={styles.slot} textStyle={{ fontSize: 14 }} />
        ))}
      </View>
      <View style={styles.grid}>
        <Pressable style={[styles.item, !preview[slot] && styles.itemOn]} onPress={() => setPreview({ ...preview, [slot]: undefined })}>
          <Text style={[bodyFont(15, '800'), { color: colors.ink }]}>없음</Text>
          <Muted style={{ fontSize: 12 }}>기본</Muted>
        </Pressable>
        {items.map((it) => {
          const on = preview[slot] === it.id;
          const has = owned.has(it.id);
          const locked = it.acquire === 'level' && level < (it.unlockLevel ?? 0);
          return (
            <Pressable key={it.id} style={[styles.item, on && styles.itemOn]} onPress={() => setPreview({ ...preview, [slot]: it.id })}>
              {it.imageUrl ? <Image source={{ uri: assetUrl(it.imageUrl)! }} style={styles.thumb} resizeMode="contain" /> : null}
              <Text style={[bodyFont(14, '800'), { color: colors.ink }]} numberOfLines={1}>{it.name}</Text>
              {has ? (
                <Tag label={on ? '착용 중' : '보유'} bg={colors.mintSoft} color={colors.mintText} />
              ) : it.acquire === 'cheese' ? (
                <Pressable onPress={() => buy(it.id)} accessibilityRole="button">
                  <Tag label={`${it.price} 치즈`} bg={colors.cheeseSoft} color={colors.cheeseText} />
                </Pressable>
              ) : (
                <Tag label={locked ? `Lv.${it.unlockLevel}` : '획득 가능'} bg={colors.track} color={colors.inkSoft} />
              )}
            </Pressable>
          );
        })}
      </View>
      <Muted>못 가진 아이템도 입어 볼 수 있어요. 치즈는 연속 학습 보상으로 모이고, 꾸미기는 점수에 영향을 주지 않아요.</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cheese: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 36, borderRadius: radius.pill, backgroundColor: colors.cheeseSoft },
  slots: { flexDirection: 'row', gap: 6 },
  slot: { flex: 1, paddingHorizontal: 4, height: 42 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { width: '31%', minHeight: 92, gap: 6, padding: 10, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white },
  thumb: { width: 56, height: 56 },
  itemOn: { borderColor: colors.primary, borderWidth: 3 },
});
