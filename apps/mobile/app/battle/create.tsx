import { DEFAULT_CONFIG } from '@zuirock/game-rules';
import {
  QUESTION_TYPES,
  ROOM_TIME_LIMITS_SEC,
  TOPIC_NAME_BY_ID,
  type QuestionType,
  type RoomSettings,
  type RoomTimeLimitSec,
  type TopicId,
} from '@zuirock/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../../src/api/client';
import { Api } from '../../src/api/endpoints';
import { Button } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { Slider } from '../../src/components/Slider';
import { Choice, ErrorText, Muted } from '../../src/components/ui';
import { settingsSummary, timeLimitLabel, TYPE_LABEL } from '../../src/lib/copy';
import { fitReveal, revealOptions } from '../../src/lib/battleTimer';
import { availableTopicIds, sanitizeTopicIds } from '../../src/lib/roomSettings';
import { useAsync } from '../../src/lib/useAsync';
import { roomStore } from '../../src/state/room';
import { bodyFont, colors, radius, titleFont } from '../../src/theme';

const TYPE_GLYPH: Record<QuestionType, string> = { chosung: 'ㅊㅅ', mcq: '1234', ox: 'O X' };
const { min: MIN_Q, max: MAX_Q } = DEFAULT_CONFIG.room.questionCount;

function Row({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.rowHead}>
      <Text style={[titleFont(19), { color: colors.ink, flex: 1 }]}>{title}</Text>
      {hint ? <Muted>{hint}</Muted> : null}
      {right}
    </View>
  );
}

/** p9 대결 방 만들기. */
export default function CreateRoom() {
  const router = useRouter();
  /** From a friend profile: that friend gets an in-app invite (AC-A7). */
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  const topics = useAsync(() => Api.topics(), []);
  const [s, setS] = useState<RoomSettings>({
    // Filled with every available topic once GET /topics resolves (never an unavailable id).
    topicIds: [],
    types: ['chosung', 'mcq'],
    questionCount: 20,
    // ★1 이상: a fresh deploy may have few questions; the lobby's shortage dialog covers the rest.
    minDifficulty: 1,
    timeLimitSec: 60,
    chosungRevealSec: 45,
    avoidRecent: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = availableTopicIds(topics.data ?? []);
  const availableKey = available.join(',');
  useEffect(() => {
    if (topics.data) setS((prev) => ({ ...prev, topicIds: sanitizeTopicIds(prev.topicIds, availableTopicIds(topics.data!)) }));
  }, [topics.data, availableKey]);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const revealOk = (r: RoomSettings['chosungRevealSec']) => revealOptions(s.timeLimitSec).includes(r);
  const topicIds = s.topicIds.filter((id) => available.includes(id));
  const noTopics = !!topics.data && available.length === 0;
  const valid = topicIds.length > 0 && s.types.length > 0 && revealOk(s.chosungRevealSec);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { code } = await Api.createRoom({ settings: { ...s, topicIds }, inviteFriendIds: invite ? [invite] : undefined });
      await roomStore.enter(code);
      router.replace(`/room/${code}/lobby`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="대결 방 만들기"
      footer={
        <>
          {topicIds.length > 0 ? (
            <Muted style={{ textAlign: 'center' }}>{settingsSummary({ ...s, topicIds }, (id) => TOPIC_NAME_BY_ID[id as TopicId])}</Muted>
          ) : null}
          <ErrorText>
            {error ??
              topics.error ??
              (noTopics ? '아직 문제가 준비된 주제가 없어요. 문제가 공개되면 방을 만들 수 있어요.' : null)}
          </ErrorText>
          <Button label="방 만들고 초대하기" onPress={create} loading={busy} disabled={!valid} />
        </>
      }
    >
      <Row title="출제 주제" hint="여러 개 고를 수 있어요" />
      <View style={styles.wrap}>
        {(topics.data ?? []).map((t) => {
          const on = t.available && topicIds.includes(t.id);
          return (
            <Choice
              key={t.id}
              label={t.available ? t.name : `${t.name} · 준비 중`}
              selected={on}
              disabled={!t.available}
              left={on ? <Icon name="check" size={18} color={colors.white} /> : null}
              onPress={() => setS({ ...s, topicIds: toggle(topicIds, t.id) })}
            />
          );
        })}
      </View>

      <Row title="문제 유형" hint="고른 유형만 나와요" />
      <View style={styles.row3}>
        {QUESTION_TYPES.map((t) => {
          const on = s.types.includes(t);
          return (
            <Pressable
              key={t}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setS({ ...s, types: toggle(s.types, t) })}
              style={[styles.typeCard, on && styles.typeOn]}
            >
              <Text style={[titleFont(24), { color: on ? colors.primary : colors.inkSoft }]}>{TYPE_GLYPH[t]}</Text>
              <Text style={[bodyFont(14, '800'), { color: colors.ink }]}>{TYPE_LABEL[t]}</Text>
            </Pressable>
          );
        })}
      </View>

      <Row
        title="문제 수"
        right={<Text style={[titleFont(30), { color: colors.primary }]}>{s.questionCount}문제</Text>}
      />
      <View style={styles.stepper}>
        <Button size="sm" variant="white" label="−5" style={styles.step} disabled={s.questionCount <= MIN_Q}
          onPress={() => setS({ ...s, questionCount: Math.max(MIN_Q, s.questionCount - 5) })} />
        <View style={{ flex: 1 }}>
          <Slider value={s.questionCount} min={MIN_Q} max={MAX_Q} step={5} accessibilityLabel="문제 수"
            onChange={(questionCount) => setS((prev) => ({ ...prev, questionCount }))} />
        </View>
        <Button size="sm" variant="white" label="+5" style={styles.step} disabled={s.questionCount >= MAX_Q}
          onPress={() => setS({ ...s, questionCount: Math.min(MAX_Q, s.questionCount + 5) })} />
      </View>

      <Row
        title="문제 난이도"
        right={
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setS({ ...s, minDifficulty: n })} hitSlop={4} accessibilityLabel={`★${n} 이상`}>
                <Icon
                  name="star"
                  size={26}
                  color={n <= s.minDifficulty ? colors.cheese : n - 0.5 === s.minDifficulty ? colors.cheeseDark : colors.borderDark}
                  filled={n <= s.minDifficulty}
                />
              </Pressable>
            ))}
            <Text style={[titleFont(20), { color: colors.primary, marginLeft: 6 }]}>★{s.minDifficulty} 이상</Text>
          </View>
        }
      />
      <Slider value={s.minDifficulty} min={1} max={5} step={0.5} accessibilityLabel="문제 난이도"
        onChange={(minDifficulty) => setS((prev) => ({ ...prev, minDifficulty }))} />

      <Row title="문제당 제한 시간" />
      <View style={styles.row3}>
        {ROOM_TIME_LIMITS_SEC.map((t) => (
          <Choice key={t} label={timeLimitLabel(t)} selected={s.timeLimitSec === t} style={styles.seg}
            onPress={() => setS({ ...s, timeLimitSec: t as RoomTimeLimitSec, chosungRevealSec: fitReveal(s.chosungRevealSec, t) })} />
        ))}
      </View>

      <Row title="초성 힌트 공개" hint="남은 시간이 이만큼일 때 공개" />
      <View style={styles.row3}>
        {revealOptions(s.timeLimitSec).map((r) => (
          <Choice key={String(r)} label={r == null ? '힌트 없음' : `${r}초 남기고`} selected={s.chosungRevealSec === r}
            style={styles.seg} textStyle={{ fontSize: 14 }}
            onPress={() => setS({ ...s, chosungRevealSec: r })} />
        ))}
      </View>

      <Row title="최근 푼 문제" hint="참가자들이 최근 푼 100문제는 덜 나와요" />
      <View style={styles.row3}>
        <Choice label="덜 나오게" selected={s.avoidRecent !== false} style={styles.seg} onPress={() => setS({ ...s, avoidRecent: true })} />
        <Choice label="상관없이" selected={s.avoidRecent === false} style={styles.seg} onPress={() => setS({ ...s, avoidRecent: false })} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  row3: { flexDirection: 'row', gap: 10 },
  seg: { flex: 1, borderRadius: radius.md, paddingHorizontal: 4 },
  typeCard: {
    flex: 1,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.lg,
    borderWidth: 3, borderBottomWidth: 5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  typeOn: { borderColor: colors.primary, borderBottomColor: colors.primaryDark, backgroundColor: colors.lavender },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { width: 64 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
