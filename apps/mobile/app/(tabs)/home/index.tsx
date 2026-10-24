import { TOPIC_NAME_BY_ID, type TopicProgressDto } from '@zuirock/shared';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { Api } from '../../../src/api/endpoints';
import { useLobbyBgm } from '../../../src/audio';
import { TapChip } from '../../../src/features/economy/TapChip';
import { BattleActions } from '../../../src/components/BattleActions';
import { Button } from '../../../src/components/Button';
import { Icon } from '../../../src/components/Icon';
import { Mascot } from '../../../src/components/Mascot';
import { AnimatedNumber, Bob, PressScale, Pulse, Skeleton, Twinkle } from '../../../src/components/motion';
import { Screen } from '../../../src/components/Screen';
import { Card, ErrorText, Muted, ProgressBar, SectionTitle } from '../../../src/components/ui';
import { useAsync } from '../../../src/lib/useAsync';
import { session, useSession } from '../../../src/state/session';
import { bodyFont, colors, radius, titleFont } from '../../../src/theme';

const TILE_ACCENTS = ['#7C6CF2', '#FF8FB1', '#2FB98F', '#FFC93C', '#FF6B5B', '#5B8DEF'];

/** Staggered rise-in; each home section passes a larger `i`. */
function Rise({ i, children }: { i: number; children: React.ReactNode }) {
  return <Animated.View entering={FadeInDown.delay(i * 70).duration(320).reduceMotion(ReduceMotion.System)}>{children}</Animated.View>;
}

/** p5 홈 (topics chosen) / p3 빈 홈 (no topics yet). */
export default function Home() {
  const router = useRouter();
  const me = useSession().member?.user;
  useLobbyBgm();
  const home = useAsync(async () => {
    const fresh = await Api.me();
    await session.updateMe(fresh);
    const [streak, daily, progress, topics] = await Promise.all([
      Api.streak().catch(() => null),
      Api.dailyStatus().catch(() => null),
      Promise.all(fresh.selectedTopicIds.map((id) => Api.topicProgress(id).catch(() => null))),
      Api.topics().catch(() => null),
    ]);
    const unavailable = new Set((topics ?? []).filter((t) => !t.available).map((t) => t.id));
    return { streak, daily, unavailable, progress: progress.filter((p): p is TopicProgressDto => p !== null) };
  }, []);

  if (!me) return null;
  const empty = me.selectedTopicIds.length === 0;
  const startSolo = (q: string) => router.push(`/solo/play?${q}`);

  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Bob>
            <Mascot size={58} mood={empty ? 'surprised' : 'smile'} />
          </Bob>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[bodyFont(14), { color: colors.inkSoft }]} numberOfLines={1}>{empty ? '반가워요!' : '오늘도 뇌 스트레칭'}</Text>
          <Text style={[titleFont(22), { color: colors.ink }]} numberOfLines={1}>
            {me.nickname}
          </Text>
          <Text style={[titleFont(16), { color: colors.primary }]}>Lv.{me.level.level}</Text>
        </View>
        {!empty ? (
          <View style={styles.chips}>
            <TapChip href="/streak" label="연속 학습 보기" style={[styles.chip, { backgroundColor: colors.coralSoft }]}>
              <Pulse active={(home.data?.streak?.current ?? 0) > 0}>
                <Icon name="flame" size={18} color={colors.wrong} />
              </Pulse>
              <Text style={[titleFont(17), { color: colors.ink }]}>{home.data?.streak?.current ?? 0}일</Text>
            </TapChip>
            <TapChip href="/shop" label="상점 열기" style={[styles.chip, { backgroundColor: colors.cheeseSoft }]}>
              <Icon name="cheese" size={16} color={colors.cheese} />
              <AnimatedNumber value={me.cheese} style={[titleFont(17), { color: colors.ink, width: 44 }]} />
            </TapChip>
          </View>
        ) : null}
      </View>
      <ErrorText>{home.error}</ErrorText>

      {empty ? (
        <Card style={styles.emptyCard}>
          <Mascot size={180} mood="surprised" />
          <Text style={[titleFont(26), { color: colors.ink, textAlign: 'center' }]}>아직 고른 주제가 없어요</Text>
          <Muted style={{ textAlign: 'center', fontSize: 16 }}>
            관심 있는 주제를 골라 학습을 시작해 보세요.{'\n'}고른 주제만 홈에 나와요.
          </Muted>
          <Button label="주제 고르고 시작하기" onPress={() => router.push('/topics/select')} style={{ alignSelf: 'stretch' }} />
        </Card>
      ) : (
        <Rise i={1}>
          <View style={styles.daily}>
            <Twinkle style={{ top: 18, right: 120 }} size={7} />
            <Twinkle style={{ top: 62, right: 30 }} size={5} delay={500} />
            <Twinkle style={{ top: 118, right: 96 }} size={6} delay={1000} color={colors.cheese} />
            <View style={styles.dailyBlob} />
            <View style={styles.dailyMascot}>
              <Bob distance={6}>
                <Mascot size={84} mood={home.data?.daily?.completed ? 'happy' : 'smile'} crown={!!home.data?.daily?.completed} />
              </Bob>
            </View>
            <Text style={[bodyFont(15, '700'), { color: colors.lavenderStrong }]}>오늘의 3분 지식 · 종합</Text>
            <Text style={[titleFont(24), { color: colors.white, lineHeight: 32, paddingRight: 70 }]}>
              {home.data?.daily?.completed ? '오늘의 3분 지식을 다 풀었어요!' : '내 주제에서 고른 10문제, 3분이면 충분해요'}
            </Text>
            <View style={styles.dailyRow}>
              <View style={{ flex: 1 }}>
                <ProgressBar value={home.data?.daily?.completed ? 1 : 0} color={colors.cheese} track="#4535C2" height={12} />
              </View>
              <Text style={[titleFont(18), { color: colors.white }]}>{home.data?.daily?.completed ? 10 : 0} / 10</Text>
            </View>
            {!home.data?.daily?.completed ? (
              <Button variant="cheese" size="md" label="풀기 시작" onPress={() => startSolo('kind=daily')} style={{ alignSelf: 'flex-start', minWidth: 150 }} />
            ) : null}
          </View>
        </Rise>
      )}

      <Rise i={2}>
        <SectionTitle>{empty ? '친구와 대결은 바로 할 수 있어요' : '친구와 대결'}</SectionTitle>
      </Rise>
      <Rise i={3}>
        <BattleActions />
      </Rise>

      {!empty ? (
        <>
          <SectionTitle
            right={
              <Pressable onPress={() => router.push('/topics/select')} hitSlop={8}>
                <Text style={[bodyFont(16, '800'), { color: colors.primary }]}>편집</Text>
              </Pressable>
            }
          >
            내 주제
          </SectionTitle>
          <View style={styles.grid}>
            <PressScale style={[styles.tile, styles.composite]} onPress={() => startSolo('kind=composite')}>
              <View style={styles.tileHead}>
                <Text style={[titleFont(19), { color: colors.ink }]}>종합</Text>
                <Icon name="sparkle" size={22} color={colors.cheeseText} />
              </View>
              <Text style={[bodyFont(14, '600'), { color: colors.cheeseText }]}>약점 위주로 출제</Text>
            </PressScale>
            {home.loading && !home.data
              ? me.selectedTopicIds.map((id) => <Skeleton key={`sk-${id}`} height={92} width="31%" radius={22} />)
              : null}
            {(home.data ? me.selectedTopicIds : []).map((id, idx) => {
              const p = home.data?.progress.find((x) => x.topicId === id);
              if (home.data?.unavailable.has(id)) {
                return (
                  <View key={id} style={[styles.tile, styles.soon]}>
                    <Text style={[titleFont(19), { color: colors.inkMuted }]}>{TOPIC_NAME_BY_ID[id]}</Text>
                    <Text style={[bodyFont(14, '700'), { color: colors.inkMuted }]}>준비 중</Text>
                  </View>
                );
              }
              return (
                <PressScale key={id} style={[styles.tile, { borderTopWidth: 6, borderTopColor: TILE_ACCENTS[idx % TILE_ACCENTS.length] }]} onPress={() => router.push(`/topics/${id}`)}>
                  <View style={styles.tileHead}>
                    <Text style={[titleFont(19), { color: colors.ink }]}>{TOPIC_NAME_BY_ID[id]}</Text>
                    <Text style={[titleFont(17), { color: colors.primary }]}>Lv.{p?.level ?? 1}</Text>
                  </View>
                  <ProgressBar value={(p?.level ?? 1) / 99} color={TILE_ACCENTS[idx % TILE_ACCENTS.length]} />
                </PressScale>
              );
            })}
            <Pressable style={[styles.tile, styles.add]} onPress={() => router.push('/topics/select')}>
              <Icon name="plus" size={26} color={colors.primary} />
              <Text style={[bodyFont(15, '800'), { color: colors.primary }]}>주제 추가</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 36, borderRadius: radius.pill },
  emptyCard: { alignItems: 'center', gap: 14, paddingVertical: 36 },
  daily: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    borderBottomWidth: 6,
    borderBottomColor: colors.primaryDark,
    padding: 22,
    gap: 14,
    overflow: 'hidden',
  },
  dailyBlob: { position: 'absolute', right: -40, top: -50, width: 190, height: 190, borderRadius: 95, backgroundColor: '#6B58EA' },
  dailyMascot: { position: 'absolute', right: 14, top: 10 },
  dailyRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '31%',
    minHeight: 92,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 14,
    justifyContent: 'space-between',
    gap: 10,
  },
  tileHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  composite: { backgroundColor: colors.cheeseSoft, borderColor: colors.cheeseSoft },
  soon: { backgroundColor: colors.track, borderColor: colors.track },
  add: { borderStyle: 'dashed', borderColor: colors.mouse, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
