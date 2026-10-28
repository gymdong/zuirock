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

/** '★2' or '★2~3' for the stage's questions. */
function bandLabel(stage: { minDifficulty: number; maxDifficulty: number } | null): string {
  if (!stage) return '';
  return stage.minDifficulty === stage.maxDifficulty ? `★${stage.minDifficulty}` : `★${stage.minDifficulty}~${stage.maxDifficulty}`;
}

/** p6 주제 레벨: overall progress, stage path, jump to a checkpoint (basic test), challenge current stage. */
export default function TopicLevel() {
  const router = useRouter();
  const { topicId } = useLocalSearchParams<{ topicId: TopicId }>();
  const progress = useAsync(() => Api.topicProgress(topicId), [topicId]);
  const p = progress.data;
  if (p && !p.started) return <Redirect href={`/topics/${topicId}/start`} />;
  const level = p?.level ?? 1;
  const MAX = Math.max(1, p?.stageCount ?? 1);
  const band = bandLabel(p?.stage ?? null);
  const jumps = (p?.checkpoints ?? []).filter((c) => c > level);

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
                ? '다시 풀 수는 있지만 XP는 없어요. 문제가 더 추가되면 새 스테이지가 열려요.'
                : level >= MAX
                  ? `마지막 스테이지예요. 깨면 이 주제를 모두 끝내요! ${band} 문제가 나와요.`
                  : `이 스테이지를 깨면 ${level + 1}번이 열려요. ${band} 문제가 나와요.`}
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
          <Text style={[titleFont(16), { color: colors.inkSoft }]}>{band ? `지금 나오는 문제 ${band}` : ''}</Text>
        </View>
        <ProgressBar value={level / MAX} />
        <Muted>스테이지가 오를수록 별이 높은 문제가 나와요 · 다시 도전하면 문제가 조금씩 바뀌어요</Muted>
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
