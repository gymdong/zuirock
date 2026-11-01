import type { RankingEntryDto } from '@zuirock/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from '../../../src/components/Text';
import { Api } from '../../../src/api/endpoints';
import { Avatar } from '../../../src/components/Avatar';
import { Button } from '../../../src/components/Button';
import { Mascot } from '../../../src/components/Mascot';
import { HighlightPulse } from '../../../src/components/fx2';
import { Rise, Skeleton } from '../../../src/components/motion';
import { Screen } from '../../../src/components/Screen';
import { Card, ErrorText, Muted } from '../../../src/components/ui';
import { percent } from '../../../src/lib/copy';
import { bestTopicLine, recordLine } from '../../../src/lib/records';
import { useAsync } from '../../../src/lib/useAsync';
import { bodyFont, colors, radius, titleFont } from '../../../src/theme';

type Mode = 'solo' | 'multi';
const MEDAL = ['#FFC93C', '#C7CCD9', '#E0A06A'];

function Place({ rank }: { rank: number | null }) {
  const medal = rank != null && rank <= 3 ? MEDAL[rank - 1] : null;
  return (
    <View style={[styles.place, medal ? { backgroundColor: medal } : null]}>
      <Text style={[titleFont(18), { color: medal ? colors.ink : colors.inkSoft }]}>{rank ?? '–'}</Text>
    </View>
  );
}

function Row({ e, mode, minAnswered, onPress }: { e: RankingEntryDto; mode: Mode; minAnswered: number; onPress: () => void }) {
  const rank = mode === 'solo' ? e.soloRank : e.multiRank;
  const best = bestTopicLine(e.record);
  return (
    <Pressable style={[styles.row, e.isMe && styles.me]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${e.nickname} 프로필`}>
      <Place rank={rank} />
      <Avatar avatar={e.avatar} size={48} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[titleFont(18), { color: colors.ink }]} numberOfLines={1}>
          {e.nickname}
          {e.isMe ? ' (나)' : ''}
        </Text>
        {mode === 'solo' ? (
          <Muted style={{ fontSize: 13 }}>Lv.{e.level}</Muted>
        ) : (
          <>
            <Muted style={{ fontSize: 13 }} >{recordLine(e.record)}</Muted>
            {best ? <Muted style={{ fontSize: 13 }}>{best}</Muted> : null}
          </>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {mode === 'solo' ? (
          <>
            <Text style={[titleFont(24), { color: colors.primary }]}>{e.clearedStages}</Text>
            <Text style={[bodyFont(12, '700'), { color: colors.inkMuted }]}>깬 스테이지</Text>
          </>
        ) : rank != null ? (
          <>
            <Text style={[titleFont(24), { color: colors.primary }]}>{percent(e.record.correctRate)}</Text>
            <Text style={[bodyFont(12, '700'), { color: colors.inkMuted }]}>평균 정답률</Text>
          </>
        ) : (
          <>
            <Text style={[titleFont(16), { color: colors.inkMuted }]}>집계 중</Text>
            <Text style={[bodyFont(12, '700'), { color: colors.inkMuted }]}>
              {e.record.answered}/{minAnswered}문제
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

/** 솔로/멀티 전환: 흰 알약이 두 칸 사이를 미끄러진다. */
function Segment({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const itemW = Math.max(0, (w - 12) / 2);
  useEffect(() => {
    const to = mode === 'solo' ? 0 : itemW;
    x.value = reduced ? to : withTiming(to, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [mode, itemW, reduced, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  return (
    <View style={styles.seg} onLayout={onLayout}>
      {w > 0 ? <Animated.View pointerEvents="none" style={[styles.segPill, { width: itemW }, pill]} /> : null}
      {(['solo', 'multi'] as const).map((k) => (
        <Pressable key={k} onPress={() => onChange(k)} style={styles.segItem} accessibilityRole="tab" accessibilityState={{ selected: mode === k }}>
          <Text style={[bodyFont(17, '800'), { color: mode === k ? colors.ink : colors.inkSoft }]}>{k === 'solo' ? '솔로' : '멀티'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** 친구 랭킹: 나와 친구들 사이 순위. 솔로(깬 스테이지 합계) / 멀티(대결 평균 정답률). */
export default function Ranking() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('solo');
  const data = useAsync(() => Api.friendRanking(), []);
  const d = data.data;
  const entries = d
    ? [...d.entries].sort((a, b) => {
        const ra = mode === 'solo' ? a.soloRank : a.multiRank;
        const rb = mode === 'solo' ? b.soloRank : b.multiRank;
        if (ra == null || rb == null) return ra == null && rb == null ? b.record.answered - a.record.answered : ra == null ? 1 : -1;
        return ra - rb || a.nickname.localeCompare(b.nickname);
      })
    : [];
  const alone = !!d && d.entries.length === 1;

  return (
    <Screen edges={['top']}>
      <Text style={[titleFont(28), { color: colors.ink }]}>친구 랭킹</Text>
      <Segment mode={mode} onChange={setMode} />
      <Muted>
        {mode === 'solo' ? '주제별로 깬 스테이지를 모두 더한 순위예요' : `대결에서 맞힌 문제 비율 순위예요 · ${d?.minAnswered ?? 10}문제 이상 풀어야 순위가 매겨져요`}
      </Muted>
      <ErrorText>{data.error}</ErrorText>

      {data.loading && !d ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={76} radius={22} />
          <Skeleton height={76} radius={22} />
          <Skeleton height={76} radius={22} />
        </View>
      ) : null}

      {alone ? (
        <Card style={{ alignItems: 'center', gap: 10 }}>
          <Mascot size={96} mood="smile" />
          <Text style={[titleFont(20), { color: colors.ink, textAlign: 'center' }]}>아직 비교할 친구가 없어요</Text>
          <Muted style={{ textAlign: 'center' }}>친구를 추가하면 서로의 순위를 볼 수 있어요</Muted>
          <Button label="친구 찾기" onPress={() => router.push('/friends')} style={{ alignSelf: 'stretch' }} />
        </Card>
      ) : null}

      {entries.map((e, i) => (
        // 모드가 바뀌면 key가 달라져 행들이 다시 차례로 올라온다
        <Rise key={`${mode}-${e.userId}`} i={Math.min(i, 5)}>
          {e.isMe ? (
            <HighlightPulse delay={450 + Math.min(i, 5) * 70}>
              <Row e={e} mode={mode} minAnswered={d?.minAnswered ?? 10} onPress={() => router.push('/profile')} />
            </HighlightPulse>
          ) : (
            <Row e={e} mode={mode} minAnswered={d?.minAnswered ?? 10} onPress={() => router.push(`/friends/${e.userId}`)} />
          )}
        </Rise>
      ))}

      {d && !alone ? <Button variant="white" size="md" label="친구 관리" onPress={() => router.push('/friends')} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', backgroundColor: colors.track, borderRadius: radius.lg, padding: 6 },
  segItem: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  segPill: { position: 'absolute', top: 6, left: 6, height: 50, borderRadius: radius.md, backgroundColor: colors.white, borderBottomWidth: 3, borderBottomColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 2, borderBottomWidth: 5, borderColor: colors.border },
  me: { borderColor: colors.primary, backgroundColor: colors.lavender },
  place: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.track, alignItems: 'center', justifyContent: 'center' },
});
