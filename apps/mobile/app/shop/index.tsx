import type { InventoryDto, ShopDto, ShopItemDto, ShopItemKind } from '@zuirock/shared';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, errorMessage } from '../../src/api/client';
import { sound } from '../../src/audio';
import { Button } from '../../src/components/Button';
import { Icon, type IconName } from '../../src/components/Icon';
import { AnimatedNumber, Pop, Skeleton } from '../../src/components/motion';
import { Screen } from '../../src/components/Screen';
import { Card, ErrorText, Muted, SectionTitle } from '../../src/components/ui';
import { EconomyApi, setCheese } from '../../src/features/economy/api';
import { ChestCard } from '../../src/features/economy/ChestCard';
import { checkPurchase, ITEM_LABEL } from '../../src/features/economy/logic';
import { useAsync } from '../../src/lib/useAsync';
import { bodyFont, colors, radius, titleFont } from '../../src/theme';

const ITEM_ICON: Record<ShopItemKind, { icon: IconName; color: string; bg: string }> = {
  streak_protection: { icon: 'flame', color: colors.wrong, bg: colors.coralSoft },
  chosung_first: { icon: 'sparkle', color: colors.primary, bg: colors.lavender },
  remove_wrong_choice: { icon: 'close', color: colors.mintText, bg: colors.mintSoft },
};

/** 상점 (item 2): cheese balance, the three products, and the 보관함 with unopened chests. */
export default function Shop() {
  const load = useAsync(() => Promise.all([EconomyApi.shop(), EconomyApi.inventory()]), []);
  const [shop, setShop] = useState<ShopDto | null>(null);
  const [inv, setInv] = useState<InventoryDto | null>(null);
  const [confirm, setConfirm] = useState<ShopItemDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!load.data) return;
    setShop(load.data[0]);
    setInv(load.data[1]);
  }, [load.data]);

  const owned = (kind: ShopItemKind) =>
    kind === 'streak_protection' ? (shop?.items.find((i) => i.kind === kind)?.owned ?? 0) : (inv?.items.find((i) => i.kind === kind)?.owned ?? 0);

  const buy = async (item: ShopItemDto) => {
    setBusy(true);
    try {
      const r = await EconomyApi.purchase(item.kind);
      sound.play('purchase');
      setShop((s) => s && { ...s, cheese: r.cheese, items: s.items.map((i) => (i.kind === item.kind ? { ...i, owned: r.owned } : i)) });
      setInv((v) => v && { ...v, items: v.items.map((i) => (i.kind === item.kind ? { ...i, owned: r.owned } : i)) });
      setCheese(r.cheese);
      setMsg({ text: `${item.name} 1개를 샀어요!`, ok: true });
    } catch (e) {
      sound.play('error');
      setMsg({
        text: e instanceof ApiError && e.code === 'INSUFFICIENT_CHEESE' ? '치즈가 부족해요' : e instanceof ApiError && e.code === 'MAX_HELD' ? `최대 ${item.max}개까지 가질 수 있어요` : errorMessage(e),
        ok: false,
      });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const ask = (item: ShopItemDto) => {
    const c = checkPurchase({ ...item, owned: owned(item.kind) }, shop?.cheese ?? 0);
    if (!c.ok) {
      sound.play('error');
      setMsg({ text: c.reason === 'max' ? `최대 ${item.max}개까지 가질 수 있어요` : `치즈가 ${c.shortfall}개 부족해요`, ok: false });
      return;
    }
    setMsg(null);
    setConfirm(item);
  };

  return (
    <Screen title="상점">
      <View style={styles.balance}>
        <Icon name="cheese" size={30} color={colors.cheese} />
        <View style={{ flex: 1 }}>
          <Muted style={{ color: colors.lavenderStrong }}>보유 치즈</Muted>
          <Pop trigger={shop?.cheese ?? 0} style={{ alignSelf: 'flex-start' }}>
            {shop ? <AnimatedNumber value={shop.cheese} duration={600} style={[titleFont(32), { color: colors.white, textAlign: 'left' }]} /> : <Skeleton height={36} width={90} />}
          </Pop>
        </View>
      </View>
      {msg ? (
        <View style={[styles.msg, { backgroundColor: msg.ok ? colors.mintSoft : colors.coralSoft }]}>
          <Text style={[bodyFont(15, '800'), { color: msg.ok ? colors.mintText : colors.wrong }]}>{msg.text}</Text>
        </View>
      ) : null}
      <ErrorText>{load.error}</ErrorText>

      <SectionTitle>상품</SectionTitle>
      {shop
        ? shop.items.map((item) => {
            const n = owned(item.kind);
            const c = checkPurchase({ ...item, owned: n }, shop.cheese);
            const ic = ITEM_ICON[item.kind];
            return (
              <Card key={item.kind} style={styles.item}>
                <View style={[styles.itemIcon, { backgroundColor: ic.bg }]}>
                  <Icon name={ic.icon} size={26} color={ic.color} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[titleFont(17), { color: colors.ink }]}>{item.name || ITEM_LABEL[item.kind]}</Text>
                  <Muted style={{ fontSize: 13, lineHeight: 18 }}>{item.desc}</Muted>
                  <Text style={[bodyFont(13, '700'), { color: colors.primary }]}>
                    보유 {n}/{item.max}
                  </Text>
                </View>
                <Button
                  testID={`buy-${item.kind}`}
                  size="sm"
                  variant={c.ok ? 'cheese' : 'white'}
                  label={c.ok || c.reason === 'cheese' ? `${item.price}` : '최대'}
                  left={c.ok || c.reason === 'cheese' ? <Icon name="cheese" size={14} color={c.ok ? colors.ink : colors.inkMuted} /> : undefined}
                  onPress={() => ask(item)}
                  style={{ width: 82 }}
                />
              </Card>
            );
          })
        : load.loading
          ? [0, 1, 2].map((i) => <Skeleton key={i} height={92} />)
          : null}

      <SectionTitle>보관함</SectionTitle>
      {inv ? (
        <>
          <View style={styles.invRow}>
            {inv.items.map((i) => (
              <View key={i.kind} style={styles.invItem}>
                <Text style={[bodyFont(13, '700'), { color: colors.inkSoft }]}>{ITEM_LABEL[i.kind]}</Text>
                <Text style={[titleFont(20), { color: colors.ink }]}>{i.owned}개</Text>
              </View>
            ))}
          </View>
          {inv.chests.length === 0 ? <Muted>열지 않은 상자가 없어요. 스테이지를 처음 클리어하면 상자를 받아요.</Muted> : null}
          {inv.chests.map((c) => (
            <ChestCard
              key={c.id}
              compact
              chest={c}
              onOpened={(r) => {
                setShop((s) => s && { ...s, cheese: r.cheese, chestsUnopened: Math.max(0, s.chestsUnopened - 1) });
                setInv((v) => v && { ...v, items: r.inventory.items });
                if (r.rewards.some((x) => x.type === 'protection')) load.reload();
              }}
            />
          ))}
        </>
      ) : null}

      <Modal transparent visible={!!confirm} animationType="fade" onRequestClose={() => setConfirm(null)}>
        <Pressable style={styles.backdrop} onPress={() => !busy && setConfirm(null)}>
          {confirm ? (
            <Pressable style={styles.dialog}>
              <Text style={[titleFont(20), { color: colors.ink, textAlign: 'center' }]}>{confirm.name} 1개를 살까요?</Text>
              <Muted style={{ textAlign: 'center' }}>
                치즈 {confirm.price}개를 써요 · 남는 치즈 {(shop?.cheese ?? 0) - confirm.price}개
              </Muted>
              <Button testID="buy-confirm" variant="cheese" label="구매하기" loading={busy} onPress={() => buy(confirm)} />
              <Button variant="white" size="md" label="취소" disabled={busy} onPress={() => setConfirm(null)} />
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  balance: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.primary, borderRadius: radius.lg, padding: 18 },
  msg: { borderRadius: radius.md, padding: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  itemIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  invRow: { flexDirection: 'row', gap: 10 },
  invItem: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, padding: 12, gap: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(36,27,77,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 360, backgroundColor: colors.cream, borderRadius: radius.xl, padding: 22, gap: 10 },
});
