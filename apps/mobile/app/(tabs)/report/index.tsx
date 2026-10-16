import { TOPIC_NAME_BY_ID } from '@zuirock/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Api } from '../../../src/api/endpoints';
import { Button } from '../../../src/components/Button';
import { Mascot } from '../../../src/components/Mascot';
import { Screen } from '../../../src/components/Screen';
import { Card, ErrorText, Muted, ProgressBar } from '../../../src/components/ui';
import { iGa } from '../../../src/lib/korean';
import { percent, signedPp, weekRange } from '../../../src/lib/copy';
import { useAsync } from '../../../src/lib/useAsync';
import { bodyFont, colors, radius, titleFont } from '../../../src/theme';

/** p12 주간 리포트: 이번 주 현황 · 주제별 정답률 · 약점 3가지 · 데이터 부족 + 진단 세트. */
export default function Report() {
  const router = useRouter();
  const [tab, setTab] = useState<'weekly' | 'history'>('weekly');
  const data = useAsync(() => Promise.all([Api.weeklyReport(), Api.weakness()]), []);
  const [weekly, weak] = data.data ?? [null, null];

  return (
    <Screen edges={['top']}>
      <View style={styles.seg}>
        {(['weekly', 'history'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.segItem, tab === k && styles.segOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Text style={[bodyFont(17, '800'), { color: tab === k ? colors.ink : colors.inkSoft }]}>{k === 'weekly' ? '주간 리포트' : '전체 기록'}</Text>
          </Pressable>
        ))}
      </View>
      <ErrorText>{data.error}</ErrorText>

      {tab === 'history' ? (
        <Card style={{ alignItems: 'center', gap: 8 }}>
          <Mascot size={96} />
          <Muted>전체 기록은 곧 열려요.</Muted>
        </Card>
      ) : weekly && weak ? (
        <>
          <View>
            <Text style={[bodyFont(15, '700'), { color: colors.inkSoft }]}>{weekRange(weekly.weekStart, weekly.weekEnd)}</Text>
            <Text style={[titleFont(28), { color: colors.ink, lineHeight: 38 }]}>
              {weekly.mostImproved
                ? `이번 주엔 ${iGa(TOPIC_NAME_BY_ID[weekly.mostImproved.topicId])}\n가장 많이 늘었어요`
                : weak.insufficientData
                  ? '이번 주 학습을\n시작해 볼까요?'
                  : '이번 주 학습 현황'}
            </Text>
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={[titleFont(28), { color: colors.ink }]}>{weekly.solved}</Text>
              <Muted>푼 문제</Muted>
            </View>
            <View style={styles.stat}>
              <Text style={[titleFont(28), { color: colors.ink }]}>{percent(weekly.correctRate)}</Text>
              <Muted>정답률</Muted>
            </View>
            <View style={[styles.stat, styles.streak]}>
              <Text style={[titleFont(28), { color: colors.ink }]}>{weekly.streakDays}일</Text>
              <Muted style={{ color: colors.cheeseText }}>연속 학습</Muted>
            </View>
          </View>

          {weak.insufficientData ? (
            <Card style={{ alignItems: 'center', gap: 10 }}>
              <Mascot size={96} mood="surprised" />
              <Text style={[titleFont(22), { color: colors.ink }]}>아직 데이터가 부족해요</Text>
              <Muted style={{ textAlign: 'center' }}>
                이번 주 {weak.weeklySolved}문제를 풀었어요. {weak.minWeeklySolves}문제 이상 풀면 약점을 찾아 드려요.
                {weak.diagnostic ? `\n내 주제별 진단 세트(${weak.diagnostic.questionCount}문제)로 시작해 보세요.` : ''}
              </Muted>
              {weak.diagnostic ? (
                <Button label="진단 세트 풀기" onPress={() => router.push('/solo/play?kind=diagnostic')} style={{ alignSelf: 'stretch' }} />
              ) : null}
            </Card>
          ) : null}

          {weekly.byTopic.length > 0 ? (
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[titleFont(19), { color: colors.ink, flex: 1 }]}>주제별 정답률</Text>
                <Muted>지난주 대비</Muted>
              </View>
              {[...weekly.byTopic]
                .sort((a, b) => (b.correctRate ?? -1) - (a.correctRate ?? -1))
                .map((t) => {
                  const down = (t.deltaPp ?? 0) < 0;
                  return (
                    <View key={t.topicId} style={styles.bar}>
                      <Text style={[bodyFont(16, '700'), { color: colors.ink, width: 56 }]}>{TOPIC_NAME_BY_ID[t.topicId]}</Text>
                      <View style={{ flex: 1 }}>
                        <ProgressBar value={t.correctRate ?? 0} height={16} color={down ? colors.wrong : colors.mouse} track={down ? colors.coralSoft : colors.lavender} />
                      </View>
                      <Text style={[titleFont(17), { color: colors.ink, width: 48, textAlign: 'right' }]}>{percent(t.correctRate)}</Text>
                      <Text style={[titleFont(15), { width: 36, color: down ? colors.wrong : (t.deltaPp ?? 0) > 0 ? colors.mintText : colors.inkSoft }]}>
                        {signedPp(t.deltaPp)}
                      </Text>
                    </View>
                  );
                })}
            </Card>
          ) : null}

          {!weak.insufficientData && weak.weaknesses.length > 0 ? (
            <>
              <Text style={[titleFont(20), { color: colors.ink }]}>다음 주 공략할 약점</Text>
              {weak.weaknesses.map((w, i) => (
                <View key={w.subfieldId} style={styles.weak}>
                  <Text style={[titleFont(22), { color: colors.wrong, width: 24 }]}>{i + 1}</Text>
                  <Text style={[bodyFont(16), { color: colors.ink, flex: 1 }]}>
                    <Text style={{ fontWeight: '800' }}>
                      {TOPIC_NAME_BY_ID[w.topicId]} · {w.subfield}
                    </Text>{' '}
                    {w.reason}
                  </Text>
                </View>
              ))}
              {weak.quest ? (
                <Button
                  label={weak.quest.completedThisWeek ? '이번 주 퀘스트 완료' : '약점 집중 퀘스트'}
                  disabled={weak.quest.completedThisWeek}
                  right={
                    weak.quest.completedThisWeek ? null : (
                      <View style={styles.xpPill}>
                        <Text style={[bodyFont(15, '800'), { color: colors.ink }]}>+50 XP</Text>
                      </View>
                    )
                  }
                  onPress={() => router.push(`/solo/play?kind=quest&subfieldId=${weak.quest!.subfieldId}`)}
                />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', backgroundColor: colors.track, borderRadius: radius.lg, padding: 6 },
  segItem: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  segOn: { backgroundColor: colors.white, borderBottomWidth: 3, borderBottomColor: colors.border },
  stats: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
  },
  streak: { backgroundColor: colors.cheeseSoft, borderColor: colors.cheeseSoft },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  xpPill: { backgroundColor: colors.cheese, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
});
