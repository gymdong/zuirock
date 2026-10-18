import type { ConsumableKind, QuestionPublicDto, UseSoloItemResponse } from '@zuirock/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '../../api/client';
import { sound } from '../../audio';
import { Button } from '../../components/Button';
import { ErrorText, Muted } from '../../components/ui';
import { emit } from '../../lib/events';
import { colors } from '../../theme';
import { EconomyApi } from './api';

const ITEM_FOR: Partial<Record<QuestionPublicDto['type'], { kind: ConsumableKind; label: string }>> = {
  chosung: { kind: 'chosung_first', label: '첫 글자 공개' },
  mcq: { kind: 'remove_wrong_choice', label: '오답 하나 지우기' },
};

// Owned counts survive question changes within a set; refreshed when a set screen mounts.
let ownedCache: Partial<Record<ConsumableKind, number>> | null = null;

/**
 * Solo-only item button (D-R2-2) for the current question: shows the owned count, uses the item
 * once per question and hands the result back (`chosungFirst` / `removedChoice`).
 */
export function SoloItemBar({ setId, question, onUsed }: { setId: string; question: QuestionPublicDto; onUsed: (r: UseSoloItemResponse) => void }) {
  const [owned, setOwned] = useState(ownedCache);
  const [used, setUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const item = ITEM_FOR[question.type];

  useEffect(() => {
    EconomyApi.inventory().then(
      (inv) => setOwned((ownedCache = Object.fromEntries(inv.items.map((i) => [i.kind, i.owned])))),
      () => undefined,
    );
  }, [setId]);
  useEffect(() => {
    setUsed(false);
    setError(null);
  }, [question.id]);

  if (!item || !owned) return null;
  const count = owned[item.kind] ?? 0;

  const use = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await EconomyApi.useItem(setId, question.id, item.kind);
      setOwned((ownedCache = { ...owned, [item.kind]: r.owned }));
      setUsed(true);
      emit('hintReveal');
      onUsed(r);
    } catch (e) {
      sound.play('error');
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Button
        testID="solo-item"
        variant="lavender"
        size="sm"
        label={`${item.label} · ${count}개`}
        disabled={used || count <= 0}
        loading={busy}
        onPress={use}
        style={{ alignSelf: 'center', minWidth: 190 }}
      />
      <Muted style={styles.note}>{used ? '아이템을 써서 이 문제는 노힌트 보너스가 없어요' : count > 0 ? '아이템을 쓰면 이 문제의 노힌트 보너스(+20%)가 없어져요' : '상점에서 치즈로 살 수 있어요'}</Muted>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, alignItems: 'center' },
  note: { fontSize: 12, textAlign: 'center', color: colors.inkMuted },
});
