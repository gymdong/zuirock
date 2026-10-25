import { DEFAULT_CONFIG } from '@zuirock/game-rules';
import { TOPIC_NAME_BY_ID, type TopicId } from '@zuirock/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../../../src/api/client';
import { Api } from '../../../src/api/endpoints';
import { Button } from '../../../src/components/Button';
import { Icon, type IconName } from '../../../src/components/Icon';
import { Mascot } from '../../../src/components/Mascot';
import { Screen } from '../../../src/components/Screen';
import { ErrorText, Muted } from '../../../src/components/ui';
import { bodyFont, colors, radius, titleFont } from '../../../src/theme';

type Mode = 'placement' | 'checkpoint' | 'lv1';

function Option({ mode, active, icon, iconBg, title, sub, onPress, children }: {
  mode: Mode; active: boolean; icon: IconName; iconBg: string; title: string; sub: string; onPress: (m: Mode) => void; children?: React.ReactNode;
}) {
  return (
    <Pressable onPress={() => onPress(mode)} style={[styles.option, active && styles.optionOn]} accessibilityRole="radio" accessibilityState={{ checked: active }}>
      <View style={styles.optionHead}>
        <View style={[styles.optionIcon, { backgroundColor: iconBg }]}>
          <Icon name={icon} size={26} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[titleFont(19), { color: colors.ink }]}>{title}</Text>
          <Muted>{sub}</Muted>
        </View>
      </View>
      {children}
    </Pressable>
  );
}

/** p7 새 주제 시작: 레벨테스트 / 원하는 레벨 기초 테스트 / Lv.1부터. */
export default function TopicStart() {
  const router = useRouter();
  const { topicId, checkpoint } = useLocalSearchParams<{ topicId: TopicId; checkpoint?: string }>();
  const [mode, setMode] = useState<Mode>(checkpoint ? 'checkpoint' : 'placement');
  const [level, setLevel] = useState(Number(checkpoint) || 30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    // The start screen is a chooser: replace it so back from the test/result goes up to the topic screen.
    if (mode === 'placement') return router.replace(`/solo/play?kind=placement&topicId=${topicId}`);
    if (mode === 'checkpoint') return router.replace(`/solo/play?kind=basic_test&topicId=${topicId}&checkpointLevel=${level}`);
    setBusy(true);
    try {
      await Api.confirmStart(topicId, { level: 1 });
      router.dismissTo(`/topics/${topicId}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const cta = mode === 'placement' ? '레벨테스트 시작' : mode === 'checkpoint' ? `Lv.${level} 기초 테스트 보기` : 'Lv.1부터 시작';
  return (
    <Screen
      title={`${TOPIC_NAME_BY_ID[topicId]} · 새 주제`}
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button label={cta} onPress={go} loading={busy} />
        </>
      }
    >
      <View style={styles.hero}>
        <Mascot size={110} mood="surprised" />
        <View style={{ flex: 1 }}>
          <Text style={[titleFont(30), { color: colors.ink, lineHeight: 38 }]}>어디서부터{'\n'}시작할까요?</Text>
          <Muted>레벨은 Lv.1~99, 스테이지처럼 하나씩 깨요</Muted>
        </View>
      </View>
      <Option mode="placement" active={mode === 'placement'} onPress={setMode} icon="report" iconBg={colors.lavender}
        title="레벨테스트로 정하기" sub="여러 난이도 문제를 풀고 시작 레벨을 찾아줘요" />
      <Option mode="checkpoint" active={mode === 'checkpoint'} onPress={setMode} icon="star" iconBg={colors.cheeseSoft}
        title="원하는 레벨로 바로 가기" sub="그 레벨 기초 테스트에 합격하면 거기부터 시작해요">
        <View style={styles.levels}>
          {DEFAULT_CONFIG.basicTest.checkpoints.map((c) => {
            const on = mode === 'checkpoint' && level === c;
            return (
              <Pressable key={c} onPress={() => { setMode('checkpoint'); setLevel(c); }} style={[styles.level, on && styles.levelOn]}>
                <Text style={[titleFont(16), { color: on ? colors.white : colors.ink }]}>Lv.{c}</Text>
              </Pressable>
            );
          })}
        </View>
      </Option>
      <Option mode="lv1" active={mode === 'lv1'} onPress={setMode} icon="check" iconBg={colors.mintSoft}
        title="Lv.1부터 차근차근" sub="테스트 없이 바로 시작해요" />
      <Text style={[bodyFont(14), { color: colors.inkSoft, textAlign: 'center' }]}>나중에도 주제 화면에서 언제든 다른 구간으로 점프할 수 있어요</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  option: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 2, borderBottomWidth: 5, borderColor: colors.border, padding: 16, gap: 12 },
  optionOn: { borderColor: colors.primary, borderWidth: 3 },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  optionIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  level: { width: '18%', height: 46, borderRadius: 14, borderWidth: 2, borderBottomWidth: 5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  levelOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
