import { DEFAULT_CONFIG, difficultyBand } from '@zuirock/game-rules';
import { TOPIC_NAME_BY_ID, type TopicId } from '@zuirock/shared';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Api } from '../../../src/api/endpoints';
import { Button } from '../../../src/components/Button';
import { Screen } from '../../../src/components/Screen';
import { StageMap } from '../../../src/components/StageMap';
import { Card, Choice, ErrorText, Muted, ProgressBar } from '../../../src/components/ui';
import { useAsync } from '../../../src/lib/useAsync';
import { colors, titleFont } from '../../../src/theme';

const MAX = DEFAULT_CONFIG.stage.maxLevel;

function bandLabel(level: number): string {
  const b = difficultyBand(level);
  return b.minDifficulty === b.maxDifficulty ? `★${b.minDifficulty}` : `★${b.minDifficulty}~${b.maxDifficulty}`;
}

/** p6 주제 레벨: overall progress, stage path, jump to a checkpoint (basic test), challenge current stage. */
export default function TopicLevel() {
  const router = useRouter();
  const { topicId } = useLocalSearchParams<{ topicId: TopicId }>();
  const progress = useAsync(() => Api.topicProgress(topicId), [topicId]);
  const p = progress.data;
  if (p && !p.started) return <Redirect href={`/topics/${topicId}/start`} />;
  const level = p?.level ?? 1;
  const band = bandLabel(level);
  const jumps = DEFAULT_CONFIG.basicTest.checkpoints.filter((c) => c > level);

  return (
    <Screen
      startAtEnd
      title={TOPIC_NAME_BY_ID[topicId]}
      right={
        <Text style={[titleFont(24), { color: colors.primary }]}>
          Lv.{level} <Text style={[titleFont(16), { color: colors.ink }]}>/ {MAX}</Text>
        </Text>
      }
      footer={
        p ? (
          <Card style={{ gap: 10 }}>
            <Text style={[titleFont(24), { color: colors.ink }]}>{p.completed ? '모든 스테이지를 깼어요!' : `스테이지 ${level}`}</Text>
            <Muted>
              {p.completed
                ? '다시 풀 수는 있지만 XP는 없어요.'
                : `이 스테이지를 깨면 ${Math.min(MAX, level + 1)}${level + 1 >= MAX ? '' : '가'} 열려요. 지금 구간은 ${band} 문제가 나와요.`}
            </Muted>
            <Button label={`Lv.${level} 도전`} onPress={() => router.push(`/solo/play?kind=stage&topicId=${topicId}`)} />
          </Card>
        ) : null
      }
    >
      <ErrorText>{progress.error}</ErrorText>
      <Card style={{ gap: 8 }}>
        <View style={styles.row}>
          <Text style={[titleFont(17), { color: colors.ink, flex: 1 }]}>전체 진행</Text>
          <Text style={[titleFont(16), { color: colors.inkSoft }]}>지금 나오는 문제 {band}</Text>
        </View>
        <ProgressBar value={level / MAX} />
        <Muted>레벨이 오를수록 별이 높은 문제가 나와요</Muted>
      </Card>

      {p ? <StageMap level={level} max={MAX} completed={p.completed} onStart={() => router.push(`/solo/play?kind=stage&topicId=${topicId}`)} /> : null}

      {jumps.length > 0 ? (
        <>
          <Text style={[titleFont(18), { color: colors.ink }]}>다른 구간으로 점프</Text>
          <View style={styles.jumps}>
            {jumps.map((c) => (
              <Choice key={c} label={String(c)} selected={false} style={styles.jump} onPress={() => router.push(`/topics/${topicId}/start?checkpoint=${c}`)} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  jumps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  jump: { borderRadius: 14, minWidth: 54, height: 44, paddingHorizontal: 10, borderColor: colors.border },
});
