import type { BattleResultRowDto } from '@zuirock/shared';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import Animated, { FadeInDown, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';
import { MAX_FONT_SCALE, Text } from '../../../src/components/Text';
import { errorMessage } from '../../../src/api/client';
import { BattleChat } from '../../../src/components/battle/BattleChat';
import { StickerBurst } from '../../../src/components/battle/StickerBurst';
import { Button } from '../../../src/components/Button';
import { Mascot } from '../../../src/components/Mascot';
import { Celebration, CrumbBurst } from '../../../src/components/fx';
import { StreakCelebration } from '../../../src/components/StreakCelebration';
import { Shine } from '../../../src/components/fx2';
import { AnimatedNumber, Bob } from '../../../src/components/motion';
import { Screen } from '../../../src/components/Screen';
import { Card, ErrorText, Muted } from '../../../src/components/ui';
import { battleXpCopy, wrongNoteCopy, xpBoostCopy } from '../../../src/lib/copy';
import { emit } from '../../../src/lib/events';
import { roomStore, useRoom } from '../../../src/state/room';
import { bodyFont, colors, radius, titleFont } from '../../../src/theme';

/** Entry delay per place (ms). */
const RISE: Record<number, number> = { 3: 0, 2: 250, 1: 500 };

const PODIUM = [
  { place: 2, height: 150, bg: colors.lavender },
  { place: 1, height: 200, bg: colors.cheese },
  { place: 3, height: 110, bg: colors.track },
] as const;

/** p11 결과: rank, score, correct count, account XP; guests get "최대 N XP" and the save button. */
export default function Result() {
  const router = useRouter();
  const room = useRoom();
  const [error, setError] = useState<string | null>(null);
  const snap = room.snapshot!;
  const results = room.finished?.results ?? snap.results ?? [];
  const you = room.finished?.you;
  const mine = results.find((r) => r.participantId === snap.you.participantId);
  const isGuest = mine?.kind === 'guest' || !!you?.canSaveByLogin;
  const total = snap.question?.total ?? snap.settings.questionCount;
  const byPlace = (n: number): BattleResultRowDto | undefined => [...results].sort((a, b) => a.rank - b.rank)[n - 1];
  const xp = you ? battleXpCopy(you.xp, isGuest) : null;
  const myRank = mine?.rank;
  const [celebrated, setCelebrated] = useState(false);
  const closeCelebration = useCallback(() => setCelebrated(true), []);
  const [streakDone, setStreakDone] = useState(false);
  const closeStreak = useCallback(() => setStreakDone(true), []);
  const streakAdvance = you?.streakAdvance;
  useEffect(() => {
    if (myRank == null) return;
    if (myRank === 1) emit('victory', { rank: myRank });
    else emit('defeat', { rank: myRank });
  }, [myRank]);
  const rankBonus = !isGuest && mine && mine.rank <= 3 ? ` · ${mine.rank}위 보너스` : '';

  return (
    <Screen
      overlay={
        myRank === 1 && !celebrated ? (
          <Celebration title="우승!" subtitle="치즈 왕관은 내 거!" crown onDone={closeCelebration} />
        ) : streakAdvance && !streakDone ? (
          <StreakCelebration advance={streakAdvance} onDone={closeStreak} />
        ) : null
      }
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          {isGuest ? (
            <Button
              variant="kakao"
              label="로그인하고 기록 저장하기"
              onPress={() => router.push({ pathname: '/login', params: { next: '/home' } })}
            />
          ) : null}
          <Button
            label="한 판 더"
            onPress={() => roomStore.rematch().catch((e: unknown) => setError(errorMessage(e)))}
          />
          {!isGuest ? <Button variant="white" label="오답과 해설 보기" onPress={() => router.push('/profile/wrong-notes')} /> : null}
          {!isGuest ? (
            <Button
              variant="white"
              label="홈으로"
              onPress={async () => {
                await roomStore.leave();
                router.dismissTo('/home');
              }}
            />
          ) : null}
        </>
      }
    >
      <Animated.Text maxFontSizeMultiplier={MAX_FONT_SCALE} entering={ZoomIn.springify().damping(9).reduceMotion(ReduceMotion.System)} style={[titleFont(36, '900'), styles.title]}>
        {myRank === 1 ? '우승! 🎉' : '대결 끝!'}
      </Animated.Text>
      {mine && mine.rank <= 3 ? <CrumbBurst count={34} power={1.2} /> : null}
      <View style={styles.podium}>
        {PODIUM.map(({ place, height, bg }) => {
          const r = byPlace(place);
          if (!r) return <View key={place} style={{ flex: 1 }} />;
          return (
            <View key={place} style={styles.col}>
              {/* Podium: 3rd rises first, then 2nd, then the winner. */}
              <Animated.View entering={ZoomIn.delay(RISE[place]! + 250).duration(300).reduceMotion(ReduceMotion.System)}>
              {place === 1 ? (
                <Bob distance={6}>
                  <Mascot size={104} mood="happy" gray={r.kind === 'guest'} crown />
                </Bob>
              ) : (
                <Mascot size={80} mood={r.kind === 'guest' ? 'smile' : 'glasses'} gray={r.kind === 'guest'} />
              )}
              </Animated.View>
              <Text style={[bodyFont(15, '800'), { color: colors.ink }]} numberOfLines={1}>
                {r.nickname}
                {r.participantId === snap.you.participantId ? ' (나)' : ''}
              </Text>
              <Animated.View
                entering={FadeInDown.delay(RISE[place]!).duration(450).springify().reduceMotion(ReduceMotion.System)}
                style={[styles.block, { height, backgroundColor: bg }, place === 1 && styles.first]}
              >
                <Text style={[titleFont(34), { color: colors.ink }]}>{r.rank}</Text>
                <AnimatedNumber value={r.score} suffix="점" style={[titleFont(17), { color: colors.ink }]} />
              </Animated.View>
            </View>
          );
        })}
      </View>
      {results.length > 3 ? (
        <View style={{ gap: 8 }}>
          {[...results].sort((a, b) => a.rank - b.rank).slice(3).map((r, i) => {
            const me = r.participantId === snap.you.participantId;
            return (
              <Animated.View
                key={r.participantId}
                entering={FadeInDown.delay(1000 + Math.min(i, 6) * 90).duration(300).reduceMotion(ReduceMotion.System)}
                style={[styles.restRow, me && styles.restMe]}
              >
                <Text style={[titleFont(18), { color: colors.inkSoft, width: 34 }]}>{r.rank}위</Text>
                <Text style={[bodyFont(16, '800'), { color: colors.ink, flex: 1 }]} numberOfLines={1}>
                  {r.nickname}
                  {me ? ' (나)' : ''}
                </Text>
                <Text style={[titleFont(18), { color: colors.primary }]}>{r.score}점</Text>
              </Animated.View>
            );
          })}
        </View>
      ) : null}

      <Card style={styles.stats}>
        {myRank != null && myRank <= 3 ? <Shine delay={1300} radius={radius.lg} /> : null}
        <View style={styles.stat}>
          <AnimatedNumber value={mine?.correctCount ?? 0} suffix={`/${total}`} duration={700} style={[titleFont(30), { color: colors.ink }]} />
          <Muted>정답</Muted>
        </View>
        <View style={styles.stat}>
          {you && !isGuest ? (
            <AnimatedNumber value={you.xp.granted} prefix="+" style={[titleFont(30), { color: colors.primary }]} />
          ) : (
            <Text style={[titleFont(isGuest ? 20 : 30), { color: colors.primary, textAlign: 'center' }]}>{xp?.value ?? '…'}</Text>
          )}
          <Muted style={{ textAlign: 'center' }}>{xp ? `${xp.caption}${rankBonus}` : ''}</Muted>
          {you && xpBoostCopy(you.xpBoost) ? <Muted style={{ textAlign: 'center', color: colors.primary }}>{xpBoostCopy(you.xpBoost)}</Muted> : null}
        </View>
        <View style={styles.stat}>
          <Text style={[titleFont(30), { color: colors.cheeseText }]}>{mine ? `${mine.rank}위` : '-'}</Text>
          <Muted>순위</Muted>
        </View>
      </Card>

      <View style={styles.note}>
        <Text style={[bodyFont(16, '700'), { color: colors.primaryDark, lineHeight: 24 }]}>
          {isGuest ? '로그인하면 이번 대결 기록과 XP가 내 계정에 저장되고, 틀린 문제는 오답노트에 담겨요.' : wrongNoteCopy(you?.wrongNotesAdded ?? 0)}
        </Text>
      </View>
      {snap.settings.chat !== false ? (
        <>
          <BattleChat lines={4} placeholder="한마디 남기기" />
          <StickerBurst />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, textAlign: 'center', marginTop: 8 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  block: { alignSelf: 'stretch', borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  first: { borderBottomWidth: 6, borderBottomColor: colors.cheeseDark },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 2, borderBottomWidth: 4, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10 },
  restMe: { borderColor: colors.primary, backgroundColor: colors.lavender },
  stats: { flexDirection: 'row', paddingVertical: 20 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  note: { backgroundColor: colors.lavender, borderRadius: radius.lg, borderBottomWidth: 4, borderBottomColor: colors.lavenderStrong, padding: 18 },
});
