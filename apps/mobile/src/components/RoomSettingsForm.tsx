import { DEFAULT_CONFIG, firstLetterElapsedSec } from '@zuirock/game-rules';
import { QUESTION_TYPES, ROOM_TIME_LIMITS_SEC, type QuestionType, type RoomSettings, type RoomTimeLimitSec, type TopicDto } from '@zuirock/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { fitReveal, revealOptions } from '../lib/battleTimer';
import { timeLimitLabel, TYPE_LABEL } from '../lib/copy';
import { availableTopicIds } from '../lib/roomSettings';
import { bodyFont, colors, radius, titleFont } from '../theme';
import { Icon } from './Icon';
import { Slider } from './Slider';
import { Text } from './Text';
import { Button } from './Button';
import { Choice, Muted } from './ui';

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

/** 방 설정 입력(방 만들기와 대기실 설정 변경이 함께 쓴다). */
export function RoomSettingsForm({ s, onChange, topics }: { s: RoomSettings; onChange: (next: RoomSettings) => void; topics: readonly TopicDto[] | null | undefined }) {
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const available = availableTopicIds(topics ?? []);
  const topicIds = s.topicIds.filter((id) => available.includes(id));
  const maxD = s.maxDifficulty ?? 5;
  // 첫 글자 힌트는 초성 힌트가 있고(남은 시간 > 15초) 초성 문제를 고른 방에서만 의미가 있다
  const firstLetterAvailable = firstLetterElapsedSec({ ...s, firstLetterHint: true }) !== null;
  return (
    <>
      <Row title="출제 주제" hint="여러 개 고를 수 있어요" />
      <View style={styles.wrap}>
        {(topics ?? []).map((t) => {
          const on = t.available && topicIds.includes(t.id);
          return (
            <Choice
              key={t.id}
              label={t.available ? t.name : `${t.name} · 준비 중`}
              selected={on}
              disabled={!t.available}
              left={on ? <Icon name="check" size={18} color={colors.white} /> : null}
              onPress={() => onChange({ ...s, topicIds: toggle(topicIds, t.id) })}
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
              onPress={() => onChange({ ...s, types: toggle(s.types, t) })}
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
          onPress={() => onChange({ ...s, questionCount: Math.max(MIN_Q, s.questionCount - 5) })} />
        <View style={{ flex: 1 }}>
          <Slider value={s.questionCount} min={MIN_Q} max={MAX_Q} step={5} accessibilityLabel="문제 수"
            onChange={(questionCount) => onChange({ ...s, questionCount })} />
        </View>
        <Button size="sm" variant="white" label="+5" style={styles.step} disabled={s.questionCount >= MAX_Q}
          onPress={() => onChange({ ...s, questionCount: Math.min(MAX_Q, s.questionCount + 5) })} />
      </View>

      <Row
        title="문제 난이도"
        right={
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Icon
                key={n}
                name="star"
                size={22}
                color={n >= s.minDifficulty && n <= maxD ? colors.cheese : n + 0.5 >= s.minDifficulty && n - 0.5 <= maxD && n < s.minDifficulty ? colors.cheeseDark : colors.borderDark}
                filled={n >= s.minDifficulty && n <= maxD}
              />
            ))}
            <Text style={[titleFont(18), { color: colors.primary, marginLeft: 6 }]}>
              {s.minDifficulty === maxD ? `★${s.minDifficulty}` : `★${s.minDifficulty}~★${maxD}`}
            </Text>
          </View>
        }
      />
      <Muted>가장 쉬운 문제와 가장 어려운 문제의 범위를 정해요</Muted>
      <Text style={[bodyFont(14, '800'), { color: colors.inkSoft }]}>최소 ★{s.minDifficulty}</Text>
      <Slider value={s.minDifficulty} min={1} max={5} step={0.5} accessibilityLabel="최소 난이도"
        onChange={(minDifficulty) => onChange({ ...s, minDifficulty, maxDifficulty: Math.max(maxD, minDifficulty) })} />
      <Text style={[bodyFont(14, '800'), { color: colors.inkSoft }]}>최대 ★{maxD}</Text>
      <Slider value={maxD} min={1} max={5} step={0.5} accessibilityLabel="최대 난이도"
        onChange={(maxDifficulty) => onChange({ ...s, maxDifficulty, minDifficulty: Math.min(s.minDifficulty, maxDifficulty) })} />

      <Row title="문제당 제한 시간" />
      <View style={styles.row3}>
        {ROOM_TIME_LIMITS_SEC.map((t) => (
          <Choice key={t} label={timeLimitLabel(t)} selected={s.timeLimitSec === t} style={styles.seg}
            onPress={() => onChange({ ...s, timeLimitSec: t as RoomTimeLimitSec, chosungRevealSec: fitReveal(s.chosungRevealSec, t) })} />
        ))}
      </View>

      <Row title="초성 힌트 공개" hint="남은 시간이 이만큼일 때 공개" />
      <View style={styles.row3}>
        {revealOptions(s.timeLimitSec).map((r) => (
          <Choice key={String(r)} label={r == null ? '힌트 없음' : `${r}초 남기고`} selected={s.chosungRevealSec === r}
            style={styles.seg} textStyle={{ fontSize: 14 }}
            onPress={() => onChange({ ...s, chosungRevealSec: r })} />
        ))}
      </View>

      {s.types.includes('chosung') ? (
        <>
          <Row title="첫 글자 힌트" hint={`초성이 열리고 ${DEFAULT_CONFIG.room.firstLetterDelayMs / 1000}초 뒤에 첫 글자도 열려요`} />
          <View style={styles.row3}>
            <Choice label="켜기" selected={firstLetterAvailable && s.firstLetterHint === true} disabled={!firstLetterAvailable} style={styles.seg} onPress={() => onChange({ ...s, firstLetterHint: true })} />
            <Choice label="끄기" selected={!firstLetterAvailable || s.firstLetterHint !== true} style={styles.seg} onPress={() => onChange({ ...s, firstLetterHint: false })} />
          </View>
          {!firstLetterAvailable ? (
            <Muted>{s.chosungRevealSec == null ? '초성 힌트가 없는 설정이라 첫 글자도 열리지 않아요' : '초성이 남은 시간 15초 이하에 열리면 첫 글자를 열 시간이 없어요'}</Muted>
          ) : null}
        </>
      ) : null}

      <Row title="최근 푼 문제" hint="참가자들이 최근 푼 100문제는 덜 나와요" />
      <View style={styles.row3}>
        <Choice label="덜 나오게" selected={s.avoidRecent !== false} style={styles.seg} onPress={() => onChange({ ...s, avoidRecent: true })} />
        <Choice label="상관없이" selected={s.avoidRecent === false} style={styles.seg} onPress={() => onChange({ ...s, avoidRecent: false })} />
      </View>

      <Row title="채팅·스티커" hint="초성 정답도 채팅으로 입력해요" />
      <View style={styles.row3}>
        <Choice label="켜기" selected={s.chat !== false} style={styles.seg} onPress={() => onChange({ ...s, chat: true })} />
        <Choice label="끄기" selected={s.chat === false} style={styles.seg} onPress={() => onChange({ ...s, chat: false })} />
      </View>
    </>
  );
}

/** 설정이 유효한지(주제·유형 1개 이상, 초성 힌트 시점이 제한 시간에 맞음). */
export function settingsValid(s: RoomSettings, topics: readonly TopicDto[] | null | undefined): boolean {
  const available = availableTopicIds(topics ?? []);
  return s.topicIds.some((id) => available.includes(id)) && s.types.length > 0 && revealOptions(s.timeLimitSec).includes(s.chosungRevealSec);
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
