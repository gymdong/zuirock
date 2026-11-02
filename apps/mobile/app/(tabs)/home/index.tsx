import { TOPIC_NAME_BY_ID, type TopicProgressDto } from '@zuirock/shared';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../../../src/components/Text';
import LOGO from '../../../assets/logo.png';
import { Api } from '../../../src/api/endpoints';
import { useLobbyBgm } from '../../../src/audio';
import { EconomyApi } from '../../../src/features/economy/api';
import { TapChip } from '../../../src/features/economy/TapChip';
import { Avatar } from '../../../src/components/Avatar';
import { Button } from '../../../src/components/Button';
import { Icon } from '../../../src/components/Icon';
import { Mascot } from '../../../src/components/Mascot';
import { AnimatedNumber, Bob, PressScale, Pulse, Rise, Skeleton } from '../../../src/components/motion';
import { Screen } from '../../../src/components/Screen';
import { Card, ErrorText, Muted, ProgressBar, SectionTitle } from '../../../src/components/ui';
import { useAsync } from '../../../src/lib/useAsync';
import { session, useSession } from '../../../src/state/session';
import { bodyFont, colors, radius, titleFont } from '../../../src/theme';

const TILE_ACCENTS = ['#7C6CF2', '#FF8FB1', '#2FB98F', '#FFC93C', '#FF6B5B', '#5B8DEF'];

/** p5 홈 (topics chosen) / p3 빈 홈 (no topics yet). 대결은 대결 탭에서만 (10/26). */
export default function Home() {
  const router = useRouter();
  const me = useSession().member?.user;
  useLobbyBgm();
  const home = useAsync(async () => {
    const fresh = await Api.me();
    await session.updateMe(fresh);
    const [streak, quests, daily, progress, topics] = await Promise.all([
      Api.streak().catch(() => null),
      EconomyApi.quests().catch(() => null),
      Api.dailyStatus().catch(() => null),
      Promise.all(fresh.selectedTopicIds.map((id) => Api.topicProgress(id).catch(() => null))),
      Api.topics().catch(() => null),
    ]);
    const unavailable = new Set((topics ?? []).filter((t) => !t.available).map((t) => t.id));
    return { streak, quests, daily, unavailable, progress: progress.filter((p): p is TopicProgressDto => p !== null) };
  }, []);

  if (!me) return null;
  const empty = me.selectedTopicIds.length === 0;
  const startSolo = (q: string) => router.push(`/solo/play?${q}`);
  const done = !!home.data?.daily?.completed;
  // 폭 380 미만(작은 폰)에서는 연속일·치즈 칩을 아래 줄로 내려 이름이 잘리지 않게 한다
  const narrow = useWindowDimensions().width < 380;

  return (
    <Screen edges={['top']}>
      <Image source={LOGO} style={styles.logo} accessibilityLabel="쥐락펴락" />
      <View style={[styles.header, narrow && { flexWrap: 'wrap' }]}>
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="프로필 보기">
          <Avatar avatar={me.avatar} size={narrow ? 56 : 68} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[bodyFont(14), { color: colors.inkMuted }]} numberOfLines={1}>{empty ? '반가워요!' : '오늘도 뇌 스트레칭'}</Text>
          <Text style={[titleFont(22), { color: colors.ink }]} numberOfLines={1}>
            {me.nickname}
          </Text>
          <Text style={[titleFont(15), { color: colors.primary }]} numberOfLines={1}>LV.{me.level.level}</Text>
        </View>
        {!empty ? (
          <View style={[styles.chips, narrow && { width: '100%' }]}>
            <TapChip href="/streak" label="연속 학습 보기" style={[styles.chip, narrow && { flex: 1, justifyContent: 'center' }, { backgroundColor: colors.coralSoft }]}>
              <Pulse active={(home.data?.streak?.current ?? 0) > 0}>
                <Icon name="flame" size={18} color={colors.wrong} />
              </Pulse>
              <Text style={[titleFont(16), { color: colors.ink }]}>{home.data?.streak?.current ?? 0}일</Text>
            </TapChip>
            <TapChip href="/shop" label="상점 열기" style={[styles.chip, narrow && { flex: 1, justifyContent: 'center' }, { backgroundColor: colors.cheeseSoft }]}>
              <Icon name="cheese" size={16} color={colors.cheese} />
              <AnimatedNumber value={me.cheese} style={[titleFont(16), { color: colors.ink, width: 40 }]} />
            </TapChip>
          </View>
        ) : null}
      </View>
      <ErrorText>{home.error}</ErrorText>

      {empty ? (
        <Card style={styles.emptyCard}>
          <Mascot size={180} mood="happy" />
          <Text style={[titleFont(26), { color: colors.ink, textAlign: 'center' }]}>아직 고른 주제가 없어요</Text>
          <Muted style={{ textAlign: 'center', fontSize: 16 }}>
            관심 있는 주제를 골라 학습을 시작해 보세요.{'\n'}고른 주제만 홈에 나와요.
          </Muted>
          <Button label="주제 고르고 시작하기" onPress={() => router.push('/topics/select')} style={{ alignSelf: 'stretch' }} />
        </Card>
      ) : (
        <>
          <Rise i={1}>
            <View style={styles.daily}>
              <View style={styles.dailyTop}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[bodyFont(15, '700'), { color: colors.lavenderStrong }]}>오늘의 3분 지식 · 종합</Text>
                  {/* 줄은 쉼표 뒤에서 직접 나누고, iOS가 한글 낱말 중간을 자르지 않게 한다 */}
                  <Text lineBreakStrategyIOS="hangul-word" style={[bodyFont(19, '700'), styles.keepAll, { color: colors.white, lineHeight: 27 }]}>
                    {done ? '오늘의 3분 지식을\n다 풀었어요!' : '내 주제에서 고른 10문제,\n3분이면 충분해요'}
                  </Text>
                </View>
                <View style={styles.dailyMascot}>
                  <Bob distance={5}>
                    <Mascot size={78} mood={done ? 'happy' : 'smile'} crown={done} />
                  </Bob>
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <ProgressBar value={done ? 1 : 0} color={colors.cheese} track="#4535C2" height={12} />
                <Text style={[titleFont(17), { color: colors.white, alignSelf: 'flex-end' }]}>{done ? 10 : 0} / 10</Text>
              </View>
              {!done ? (
                <Button variant="cheese" size="md" label="풀기 시작" onPress={() => startSolo('kind=daily')} style={{ alignSelf: 'flex-start', minWidth: 150 }} />
              ) : null}
            </View>
          </Rise>

          {home.data?.quests ? (
            <Rise i={2}>
              <PressScale style={styles.questCard} onPress={() => router.push('/quests')}>
                <View style={styles.questIcon}>
                  <Icon name="trophy" size={24} color={colors.cheese} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[titleFont(17), { color: colors.ink }]}>오늘의 퀘스트</Text>
                  <ProgressBar
                    value={home.data.quests.quests.filter((q) => q.done).length / Math.max(1, home.data.quests.quests.length)}
                    color={colors.correct}
                    height={10}
                  />
                </View>
                <Text style={[titleFont(16), { color: colors.inkMuted }]}>
                  {home.data.quests.quests.filter((q) => q.done).length}/{home.data.quests.quests.length}
                </Text>
                {home.data.quests.claimable > 0 ? (
                  <View style={styles.questBadge} testID="quest-badge">
                    <Text style={[bodyFont(12, '800'), { color: colors.white }]}>받기 {home.data.quests.claimable}</Text>
                  </View>
                ) : null}
              </PressScale>
            </Rise>
          ) : null}

          <SectionTitle
            right={
              <Pressable onPress={() => router.push('/topics/select')} hitSlop={8}>
                <Text style={[bodyFont(16, '700'), { color: colors.inkMuted }]}>편집</Text>
              </Pressable>
            }
          >
            내 주제
          </SectionTitle>
          <View style={styles.grid}>
            <PressScale style={[styles.tile, styles.composite]} onPress={() => startSolo('kind=composite')}>
              <View style={styles.sparkle}>
                <Icon name="sparkle" size={18} color={colors.ear} />
              </View>
              <Text style={[titleFont(18), { color: colors.ink }]}>종합</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[bodyFont(12, '600'), { color: colors.compositeText }]}>
                약점 위주로 출제
              </Text>
            </PressScale>
            {home.loading && !home.data
              ? me.selectedTopicIds.map((id) => <Skeleton key={`sk-${id}`} height={92} width="30.5%" radius={22} />)
              : null}
            {(home.data ? me.selectedTopicIds : []).map((id, idx) => {
              const p = home.data?.progress.find((x) => x.topicId === id);
              if (home.data?.unavailable.has(id)) {
                return (
                  <View key={id} style={[styles.tile, styles.soon]}>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[titleFont(17), { color: colors.inkMuted }]}>{TOPIC_NAME_BY_ID[id]}</Text>
                    <Text style={[bodyFont(14, '700'), { color: colors.inkMuted }]}>준비 중</Text>
                  </View>
                );
              }
              const accent = TILE_ACCENTS[idx % TILE_ACCENTS.length];
              return (
                <PressScale key={id} style={[styles.tile, { borderBottomColor: accent }]} onPress={() => router.push(`/topics/${id}`)}>
                  <View style={styles.tileHead}>
                    {/* 주제 이름 길이와 상관없이 한 줄로: 길면 글자를 조금 줄인다 */}
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[titleFont(17), { color: colors.ink, flexShrink: 1 }]}>
                      {TOPIC_NAME_BY_ID[id]}
                    </Text>
                    <Text numberOfLines={1} style={[bodyFont(12, '700'), { color: colors.inkMuted }]}>Lv.{p?.level ?? 1}</Text>
                  </View>
                  <ProgressBar value={p?.completed ? 1 : Math.max(0, (p?.level ?? 1) - 1) / Math.max(1, p?.stageCount ?? 1)} color={accent} track={colors.lavender} />
                </PressScale>
              );
            })}
            <Pressable style={[styles.tile, styles.add]} onPress={() => router.push('/topics/select')} accessibilityRole="button" accessibilityLabel="주제 추가">
              <View style={styles.addCircle}>
                <Icon name="plus" size={22} color={colors.white} />
              </View>
            </Pressable>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { width: 95, height: 28, marginTop: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 36, borderRadius: radius.pill },
  emptyCard: { alignItems: 'center', gap: 14, paddingVertical: 36 },
  daily: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: 22, gap: 16 },
  dailyTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dailyMascot: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center' },
  questCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 2, borderBottomWidth: 5, borderColor: colors.border, padding: 14 },
  questIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.cheeseSoft, alignItems: 'center', justifyContent: 'center' },
  questBadge: { position: 'absolute', top: -10, right: 10, backgroundColor: colors.wrong, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '30.5%',
    minHeight: 92,
    backgroundColor: colors.tile,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderBottomWidth: 5,
    borderColor: colors.lavenderStrong,
    padding: 12,
    justifyContent: 'space-between',
    gap: 10,
  },
  // 이름과 레벨을 두 줄로: 폰트가 넓어져도 주제 이름이 잘리지 않는다
  tileHead: { gap: 2 },
  composite: { backgroundColor: colors.coralSoft, borderColor: colors.peach, borderBottomColor: colors.compositeText, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 18 },
  sparkle: { position: 'absolute', top: 8, left: 10 },
  // 웹: 한글을 낱말 단위로 줄바꿈 (iOS는 lineBreakStrategyIOS)
  keepAll: { wordBreak: 'keep-all' } as object,
  soon: { backgroundColor: colors.track, borderColor: colors.track, borderBottomColor: colors.borderDark },
  add: { borderStyle: 'dashed', borderColor: colors.lavenderStrong, borderBottomWidth: 2, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  addCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.lavenderStrong, alignItems: 'center', justifyContent: 'center' },
});
