import { TOPIC_NAME_BY_ID } from '@zuirock/shared';
import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Mascot } from '../../src/components/Mascot';
import { Screen } from '../../src/components/Screen';
import { Card, Muted } from '../../src/components/ui';
import { soloXpCopy, wrongNoteCopy } from '../../src/lib/copy';
import { soloResult } from '../../src/state/solo';
import { colors, radius, titleFont } from '../../src/theme';

/** Solo set result: correct count, pass/clear, XP (or why none), wrong-note count. */
export default function SoloResult() {
  const router = useRouter();
  const { set, result } = soloResult;
  if (!set || !result) return <Redirect href="/home" />;
  const headline =
    result.kind === 'stage'
      ? result.passed
        ? `스테이지 클리어!${result.topicLevel ? ` Lv.${result.topicLevel}` : ''}`
        : '아쉬워요, 다시 도전해요'
      : result.kind === 'daily'
        ? '오늘의 3분 지식 완료!'
        : result.kind === 'diagnostic'
          ? '진단 세트 완료!'
          : '세트 완료!';
  return (
    <Screen
      footer={
        <>
          <Button label="홈으로" onPress={() => router.replace('/home')} />
          {result.wrongNotesAdded > 0 ? <Button variant="white" label="오답노트 보기" onPress={() => router.push('/profile/wrong-notes')} /> : null}
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: 8, marginTop: 20 }}>
        <Mascot size={140} mood={result.passed ? 'happy' : 'surprised'} crown={result.passed && result.kind === 'stage'} />
        <Text style={[titleFont(30), { color: colors.ink, textAlign: 'center' }]}>{headline}</Text>
        {set.topicId ? <Muted>{TOPIC_NAME_BY_ID[set.topicId]}</Muted> : null}
      </View>
      <Card style={styles.stats}>
        <View style={styles.stat}>
          <Text style={[titleFont(32), { color: colors.ink }]}>
            {result.correctCount}/{result.totalCount}
          </Text>
          <Muted>정답</Muted>
        </View>
        <View style={styles.stat}>
          <Text style={[titleFont(result.xp.granted > 0 ? 32 : 16), { color: colors.primary, textAlign: 'center' }]}>
            {soloXpCopy(result.xp)}
          </Text>
          <Muted>계정 XP</Muted>
        </View>
      </Card>
      <View style={styles.note}>
        <Text style={[titleFont(16), { color: colors.primaryDark }]}>{wrongNoteCopy(result.wrongNotesAdded)}</Text>
        {result.streakCounted ? <Muted>오늘 연속 학습에 포함됐어요</Muted> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', paddingVertical: 20 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  note: { backgroundColor: colors.lavender, borderRadius: radius.lg, padding: 18, gap: 4 },
});
