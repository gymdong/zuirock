import type { ChestGrantDto, DailyQuestDto, DailyQuestsDto } from '@zuirock/shared';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View, type TextStyle } from 'react-native';
import { Text } from '../../src/components/Text';
import { errorMessage } from '../../src/api/client';
import { Button } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { Bob, Rise, Skeleton } from '../../src/components/motion';
import { Screen } from '../../src/components/Screen';
import { Card, ErrorText, Muted, ProgressBar } from '../../src/components/ui';
import { EconomyApi } from '../../src/features/economy/api';
import { ChestCard } from '../../src/features/economy/ChestCard';
import { emit } from '../../src/lib/events';
import { useAsync } from '../../src/lib/useAsync';
import { bodyFont, colors, radius, titleFont } from '../../src/theme';

type Row = Pick<DailyQuestDto, 'id' | 'title' | 'done' | 'claimed' | 'chest'> & { progress: number; target: number; desc?: string };

/** 'N시간 M분 뒤 초기화' until 00:00 KST. */
function resetText(resetsAt: string): string {
  const ms = Math.max(0, new Date(resetsAt).getTime() - Date.now());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}시간 ${m}분 뒤 초기화` : `${m}분 뒤 초기화`;
}

function QuestRow({ q, bonus, busy, onClaim, onOpen }: { q: Row; bonus?: boolean; busy: boolean; onClaim: () => void; onOpen: () => void }) {
  const chestOpen = q.claimed && q.chest && !q.chest.opened;
  return (
    <Card style={[styles.row, bonus && styles.bonus, q.claimed && q.chest?.opened ? { opacity: 0.7 } : null]}>
      <View style={[styles.badge, q.done && styles.badgeDone]}>
        {q.done ? <Icon name="check" size={20} color={colors.white} /> : <Icon name={bonus ? 'trophy' : 'star'} size={20} color={colors.inkMuted} />}
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text lineBreakStrategyIOS="hangul-word" style={[bodyFont(16, '800'), { color: colors.ink, wordBreak: 'keep-all' } as TextStyle]}>{q.title}</Text>
        {q.desc ? <Muted style={{ fontSize: 13 }}>{q.desc}</Muted> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <ProgressBar value={q.target ? q.progress / q.target : 0} color={q.done ? colors.correct : colors.primary} height={10} />
          </View>
          <Text style={[bodyFont(13, '800'), { color: colors.inkMuted }]}>
            {q.progress} / {q.target}
          </Text>
        </View>
      </View>
      {q.done && !q.claimed ? (
        <Button testID={`quest-claim-${q.id}`} variant="cheese" size="sm" label="받기" loading={busy} onPress={onClaim} style={{ minWidth: 76 }} />
      ) : chestOpen ? (
        <Button testID={`quest-open-${q.id}`} variant="cheese" size="sm" label="상자 열기" onPress={onOpen} style={{ minWidth: 96 }} />
      ) : q.claimed ? (
        <Text style={[bodyFont(14, '800'), { color: colors.mintText }]}>받음</Text>
      ) : null}
    </Card>
  );
}

/** 일일 퀘스트(11/1): 하루 3개를 깨면 퀘스트 상자, 모두 깨면 좋은 상자까지. */
export default function Quests() {
  const quests = useAsync(() => EconomyApi.quests(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chest, setChest] = useState<{ chest: ChestGrantDto; note: string } | null>(null);

  const claim = async (id: string, note: string) => {
    setBusy(id);
    setError(null);
    try {
      const res = await EconomyApi.claimQuest(id);
      emit('tap');
      setChest({ chest: { id: res.chest.id, tier: res.chest.tier }, note });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const close = () => {
    setChest(null);
    quests.reload();
  };

  const d: DailyQuestsDto | null = quests.data;
  const bonusRow: Row | null = d ? { ...d.bonus, progress: d.bonus.cleared, target: d.bonus.total, desc: '오늘의 퀘스트를 모두 끝내면 좋은 상자를 한 번 더 받아요' } : null;
  const done = d ? d.quests.filter((q) => q.done).length : 0;

  return (
    <Screen title="오늘의 퀘스트">
      <Rise i={0}>
        <View style={styles.head}>
          <Bob distance={4}>
            <Icon name="trophy" size={34} color={colors.cheese} />
          </Bob>
          <View style={{ flex: 1 }}>
            <Text style={[titleFont(22), { color: colors.ink }]}>{d ? `${done} / ${d.quests.length} 완료` : '불러오는 중'}</Text>
            <Muted>{d ? resetText(d.resetsAt) : ' '}</Muted>
          </View>
        </View>
      </Rise>
      <ErrorText>{error ?? quests.error}</ErrorText>
      {d ? (
        <>
          {d.quests.map((q, i) => (
            <Rise key={q.id} i={i + 1}>
              <QuestRow
                q={q}
                busy={busy === q.id}
                onClaim={() => void claim(q.id, '일일 퀘스트 보상이에요')}
                onOpen={() => q.chest && setChest({ chest: { id: q.chest.id, tier: q.chest.tier }, note: '일일 퀘스트 보상이에요' })}
              />
            </Rise>
          ))}
          {bonusRow ? (
            <Rise i={d.quests.length + 1}>
              <QuestRow
                q={bonusRow}
                bonus
                busy={busy === 'all'}
                onClaim={() => void claim('all', '모든 퀘스트를 끝낸 보너스예요')}
                onOpen={() => d.bonus.chest && setChest({ chest: { id: d.bonus.chest.id, tier: d.bonus.chest.tier }, note: '모든 퀘스트를 끝낸 보너스예요' })}
              />
            </Rise>
          ) : null}
        </>
      ) : quests.loading ? (
        <>
          <Skeleton height={92} radius={22} />
          <Skeleton height={92} radius={22} />
          <Skeleton height={92} radius={22} />
        </>
      ) : null}
      <Modal supportedOrientations={['portrait', 'landscape']} visible={chest !== null} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="닫기">
          <Pressable style={styles.sheet} onPress={() => undefined}>
            {chest ? <ChestCard chest={chest.chest} note={chest.note} /> : null}
            <Button variant="white" size="md" label="닫기" onPress={close} style={{ alignSelf: 'stretch' }} />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bonus: { borderColor: colors.cheese, backgroundColor: colors.cheeseSoft },
  badge: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.track, alignItems: 'center', justifyContent: 'center' },
  badgeDone: { backgroundColor: colors.correct },
  backdrop: { flex: 1, backgroundColor: 'rgba(36,27,77,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 360, gap: 10, borderRadius: radius.xl },
});
