import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { errorMessage } from '../../src/api/client';
import { Api } from '../../src/api/endpoints';
import { Button } from '../../src/components/Button';
import { Mascot } from '../../src/components/Mascot';
import { Confetti } from '../../src/components/motion';
import { Screen } from '../../src/components/Screen';
import { Card, ErrorText, Muted } from '../../src/components/ui';
import { soloResult } from '../../src/state/solo';
import { colors, titleFont } from '../../src/theme';

/** Placement result (AC-S3): "Lv.N부터 시작할까요?" with lower options if the user says no. */
export default function PlacementResult() {
  const router = useRouter();
  const { set, placement } = soloResult;
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!set?.topicId || !placement) return <Redirect href="/home" />;
  const topicId = set.topicId;

  const confirm = async (level: number) => {
    setBusy(level);
    try {
      await Api.confirmStart(topicId, { level, setAttemptId: set.setAttemptId });
      router.dismissTo(`/topics/${topicId}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  return (
    <Screen title="레벨테스트 결과" back={false}>
      <Confetti count={24} />
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Mascot size={130} mood="happy" />
        <Text style={[titleFont(30), { color: colors.ink, textAlign: 'center' }]}>Lv.{placement.recommendedLevel}부터 시작할까요?</Text>
        <Muted>최근 문제 평균 난이도 ★{placement.averageDifficulty}</Muted>
      </View>
      <Button label={`Lv.${placement.recommendedLevel}부터 시작`} loading={busy === placement.recommendedLevel} onPress={() => confirm(placement.recommendedLevel)} />
      {placement.lowerOptions.length > 0 ? (
        <Card style={{ gap: 10 }}>
          <Text style={[titleFont(18), { color: colors.ink }]}>더 낮은 곳에서 시작하기</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {placement.lowerOptions.map((lv) => (
              <Button key={lv} size="sm" variant="white" label={`Lv.${lv}`} loading={busy === lv} onPress={() => confirm(lv)} style={{ minWidth: 80 }} />
            ))}
          </View>
        </Card>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
