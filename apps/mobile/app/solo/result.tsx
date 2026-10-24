import { TOPIC_NAME_BY_ID } from '@zuirock/shared';
import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { Api } from '../../src/api/endpoints';
import { Button } from '../../src/components/Button';
import { Mascot } from '../../src/components/Mascot';
import { AnimatedNumber, Bob, Confetti } from '../../src/components/motion';
import { emit } from '../../src/lib/events';
import { useEffect } from 'react';
import { Screen } from '../../src/components/Screen';
import { Card, Muted } from '../../src/components/ui';
import { ChestCard } from '../../src/features/economy/ChestCard';
import { soloXpCopy, wrongNoteCopy } from '../../src/lib/copy';
import { soloResult } from '../../src/state/solo';
import { colors, radius, titleFont } from '../../src/theme';

/** Solo set result: correct count, pass/clear, XP (or why none), wrong-note count. */
export default function SoloResult() {
  const router = useRouter();
  const { set, result } = soloResult;
  const levelUp = result?.kind === 'stage' && result.passed && result.firstClear ? result.topicLevel : null;
  useEffect(() => {
    if (levelUp) emit('levelUp', { level: levelUp });
  }, [levelUp]);
  if (!set || !result) return <Redirect href="/home" />;
  const headline =
    result.kind === 'stage'
      ? result.passed
        ? `스테이지 클리어!${result.topicLevel ? ` Lv.${result.topicLevel}` : ''}`
        : '아쉬워요, 다시 도전해요'
      : result.kind === 'basic_test'
        ? result.passed
          ? `기초 테스트 합격! Lv.${set.level}부터 시작할 수 있어요`
          : '아쉬워요, 진행은 그대로예요'
      : result.kind === 'daily'
        ? '오늘의 3분 지식 완료!'
        : result.kind === 'diagnostic'
          ? '진단 세트 완료!'
          : '세트 완료!';
  return (
    <Screen
      footer={
        <>
          {result.kind === 'basic_test' && result.passed && set.topicId && set.level ? (
            <Button
              label={`Lv.${set.level}부터 시작`}
              onPress={() =>
                Api.confirmStart(set.topicId!, { level: set.level!, setAttemptId: set.setAttemptId }).then(
                  () => router.dismissTo(`/topics/${set.topicId}`),
                  () => router.dismissTo(`/topics/${set.topicId}`),
                )
              }
            />
          ) : null}
          <Button
            variant={result.kind === 'basic_test' && result.passed ? 'white' : 'primary'}
            label={set.topicId ? '주제 화면으로' : '홈으로'}
            onPress={() => router.dismissTo(set.topicId ? `/topics/${set.topicId}` : '/home')}
          />
          {result.kind === 'stage' && set.topicId ? (
            <Button
              variant="white"
              label={result.passed && result.topicLevel ? `Lv.${result.topicLevel} 도전` : '다시 도전'}
              onPress={() => router.replace(`/solo/play?kind=stage&topicId=${set.topicId}`)}
            />
          ) : null}
          {result.wrongNotesAdded > 0 ? <Button variant="white" label="오답노트 보기" onPress={() => router.push('/profile/wrong-notes')} /> : null}
        </>
      }
    >
      {result.passed ? <Confetti count={32} /> : null}
      <View style={{ alignItems: 'center', gap: 8, marginTop: 20 }}>
        <Animated.View entering={ZoomIn.springify().damping(9).reduceMotion(ReduceMotion.System)}>
          <Bob distance={6}>
            <Mascot size={140} mood={result.passed ? 'happy' : 'surprised'} crown={result.passed && result.kind === 'stage'} />
          </Bob>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(200).duration(300).reduceMotion(ReduceMotion.System)} style={{ alignItems: 'center', gap: 8 }}>
          <Text style={[titleFont(30), { color: colors.ink, textAlign: 'center' }]}>{headline}</Text>
          {set.topicId ? <Muted>{TOPIC_NAME_BY_ID[set.topicId]}</Muted> : null}
        </Animated.View>
      </View>
      <Animated.View entering={FadeInDown.delay(420).duration(320).reduceMotion(ReduceMotion.System)}>
      <Card style={styles.stats}>
        <View style={styles.stat}>
          <Text style={[titleFont(32), { color: colors.ink }]}>
            {result.correctCount}/{result.totalCount}
          </Text>
          <Muted>정답</Muted>
        </View>
        <View style={styles.stat}>
          {result.xp.granted > 0 && !result.xp.capReached ? (
            <AnimatedNumber value={result.xp.granted} prefix="+" suffix=" XP" style={[titleFont(32), { color: colors.primary }]} />
          ) : (
            <Text style={[titleFont(result.xp.granted > 0 ? 32 : 16), { color: colors.primary, textAlign: 'center' }]}>
              {soloXpCopy(result.xp)}
            </Text>
          )}
          <Muted>계정 XP</Muted>
        </View>
      </Card>
      </Animated.View>
      {result.chest ? (
        <Animated.View entering={FadeInDown.delay(640).duration(320).reduceMotion(ReduceMotion.System)}>
          <ChestCard chest={result.chest} />
        </Animated.View>
      ) : null}
      <Animated.View entering={FadeInDown.delay(820).duration(320).reduceMotion(ReduceMotion.System)} style={styles.note}>
        <Text style={[titleFont(16), { color: colors.primaryDark }]}>{wrongNoteCopy(result.wrongNotesAdded)}</Text>
        {result.streakCounted ? <Muted>오늘 연속 학습에 포함됐어요</Muted> : null}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', paddingVertical: 20 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  note: { backgroundColor: colors.lavender, borderRadius: radius.lg, padding: 18, gap: 4 },
});
