import { TOPIC_NAME_BY_ID, type ScoreboardEntryDto, type SubmitAnswerResult } from '@zuirock/shared';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../../../src/api/client';
import { Button } from '../../../src/components/Button';
import { ChosungBoxes, ChosungInput } from '../../../src/components/ChosungInput';
import { Icon } from '../../../src/components/Icon';
import { Screen } from '../../../src/components/Screen';
import { Card, Muted, ProgressBar, Tag } from '../../../src/components/ui';
import { TYPE_LABEL } from '../../../src/lib/copy';
import { useNow } from '../../../src/lib/useNow';
import { roomStore, useRoom } from '../../../src/state/room';
import { session } from '../../../src/state/session';
import { bodyFont, colors, radius, titleFont } from '../../../src/theme';

type Feedback = { tone: 'good' | 'bad' | 'near' | 'info'; text: string } | null;

function feedbackFor(r: SubmitAnswerResult): Feedback {
  switch (r.status) {
    case 'correct':
      return { tone: 'good', text: `정답! +${r.score}점` };
    case 'near':
      // Shown only to the submitter; the server never broadcasts near-misses (AC-M6).
      return { tone: 'near', text: '거의 비슷했어요!' };
    case 'wrong':
      return r.final ? { tone: 'bad', text: '아쉬워요, 오답이에요' } : { tone: 'bad', text: '오답이에요. 다시 입력해 보세요' };
    case 'late':
      return { tone: 'info', text: '시간이 지나서 제출되지 않았어요' };
    case 'duplicate':
      return { tone: 'info', text: '이미 제출했어요' };
  }
}

const now = () => roomStore.clock.now();

/** p8 대결 진행. Timer and scores come from the server clock (timeSync). */
export default function Play() {
  const router = useRouter();
  const room = useRoom();
  const t = useNow(now);
  const snap = room.snapshot!;
  const q = snap.question;
  const reveal = snap.reveal;
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const board = useRef<ScoreboardEntryDto[]>([]);
  if (reveal) board.current = reveal.scoreboard;

  const index = q?.index ?? reveal?.index ?? 0;
  useEffect(() => {
    setFeedback(null);
    setPicked(null);
    setLocked(false);
  }, [index]);

  if (!q) return null;
  const you = snap.you.question;
  const done = locked || !!you?.solved || !!you?.gaveUp || (q.question.type !== 'chosung' && !!you?.submitted);
  const inQuestion = snap.phase === 'question';
  const limitMs = q.deadlineAt - q.startedAt;
  const elapsed = Math.min(limitMs, Math.max(0, t - q.startedAt));
  const secLeft = roomStore.clock.secondsLeft(q.deadlineAt);
  const hintAt = q.chosungRevealAt;
  const hintSec = hintAt ? Math.round((hintAt - q.startedAt) / 1000) : null;
  const toHint = hintAt ? Math.max(0, Math.ceil((hintAt - t) / 1000)) : null;

  const submit = async (answer: string) => {
    if (q.question.type !== 'chosung') {
      setPicked(answer);
      setLocked(true);
    }
    try {
      const r = await roomStore.submit(q.index, answer);
      setFeedback(feedbackFor(r));
      if (r.final) setLocked(true);
    } catch (e) {
      setFeedback({ tone: 'info', text: errorMessage(e) });
    }
  };

  const giveUp = async () => {
    setLocked(true);
    try {
      await roomStore.giveUp(q.index);
      setFeedback({ tone: 'info', text: '이 문제는 포기했어요' });
    } catch (e) {
      setFeedback({ tone: 'info', text: errorMessage(e) });
    }
  };

  const scores =
    board.current.length > 0
      ? board.current
      : snap.participants.map((p) => ({ participantId: p.participantId, nickname: p.nickname, score: 0, correctCount: 0 }));
  const top = [...scores].sort((a, b) => b.score - a.score).slice(0, 3);
  const meId = snap.you.participantId;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="나가기"
          hitSlop={10}
          onPress={async () => {
            await roomStore.leave();
            router.replace(session.get().member ? '/home' : '/login');
          }}
        >
          <Icon name="close" size={28} color={colors.inkSoft} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar value={(q.index + 1) / q.total} track={colors.track} height={14} />
        </View>
        <Text style={[titleFont(20), { color: colors.ink }]}>
          {q.index + 1} / {q.total}
        </Text>
      </View>

      <View style={styles.board}>
        {top.map((s, i) => {
          const mine = s.participantId === meId;
          return (
            <View key={s.participantId} style={[styles.scoreCard, mine && styles.scoreMine]}>
              <Text style={[bodyFont(13, '700'), { color: mine ? colors.lavenderStrong : colors.inkSoft }]} numberOfLines={1}>
                {i + 1}위 · {mine ? '나' : s.nickname}
              </Text>
              <Text style={[titleFont(24), { color: mine ? colors.white : colors.ink }]}>{s.score}</Text>
            </View>
          );
        })}
      </View>

      <Card style={styles.qCard}>
        <View style={styles.qHead}>
          <Tag label={`${TOPIC_NAME_BY_ID[q.question.topicId]} · ★${q.question.difficulty} · ${TYPE_LABEL[q.question.type]}`} />
          <Text style={[titleFont(30), { color: secLeft <= 5 && inQuestion ? colors.wrong : colors.ink }]}>
            {inQuestion ? `${secLeft}초` : '정답 공개'}
          </Text>
        </View>
        <View>
          <ProgressBar value={elapsed / limitMs} track={colors.track} height={12} />
          {hintSec != null ? <View style={[styles.marker, { left: `${(hintSec * 1000 * 100) / limitMs}%` }]} /> : null}
          <View style={styles.timeLabels}>
            <Text style={[bodyFont(13, '700'), { color: colors.inkSoft }]}>0초</Text>
            <Text style={[bodyFont(13, '700'), { color: colors.inkSoft }]}>
              {hintSec != null ? <Text style={{ color: colors.cheeseText }}>{hintSec}초 초성 공개   </Text> : null}
              {Math.round(limitMs / 1000)}초
            </Text>
          </View>
        </View>
        <Text style={[titleFont(23), { color: colors.ink, lineHeight: 32 }]}>{q.question.question}</Text>

        {q.question.type === 'chosung' ? (
          <>
            <ChosungBoxes chosung={q.chosung} length={q.question.answerLength ?? 0} />
            {inQuestion && !q.chosung && toHint != null ? (
              <Text style={[bodyFont(15, '700'), styles.hint]}>
                초성 힌트까지 {toHint}초 · 지금 맞히면 <Text style={styles.bonus}> 노힌트 보너스 </Text>
              </Text>
            ) : inQuestion && hintAt == null ? (
              <Text style={[bodyFont(15, '700'), styles.hint]}>힌트 없는 문제예요 · 맞히면 노힌트 보너스</Text>
            ) : null}
          </>
        ) : null}
      </Card>

      {inQuestion ? (
        <>
          {q.question.type === 'chosung' ? (
            <View style={{ gap: 8 }}>
              <Text style={[titleFont(18), { color: colors.ink }]}>정답 입력</Text>
              <ChosungInput onSubmit={submit} disabled={done} />
              {!done ? (
                <Button variant="white" size="sm" label="포기" onPress={giveUp} style={{ alignSelf: 'flex-end', width: 96 }} />
              ) : null}
            </View>
          ) : (
            <View style={q.question.type === 'ox' ? styles.oxRow : { gap: 10 }}>
              {(q.question.type === 'ox' ? ['O', 'X'] : (q.question.choices ?? [])).map((c) => (
                <Button
                  key={c}
                  variant={picked === c ? 'primary' : 'white'}
                  label={c}
                  disabled={done && picked !== c}
                  onPress={() => !done && submit(c)}
                  style={q.question.type === 'ox' ? { flex: 1 } : undefined}
                />
              ))}
            </View>
          )}
          {feedback ? (
            <Text
              style={[
                bodyFont(17, '800'),
                styles.feedback,
                { color: feedback.tone === 'good' ? colors.correct : feedback.tone === 'bad' ? colors.wrong : feedback.tone === 'near' ? colors.cheeseText : colors.inkSoft },
              ]}
            >
              {feedback.text}
            </Text>
          ) : null}
          {room.progress && room.progress.questionIndex === q.index ? (
            <Muted style={{ textAlign: 'center' }}>
              {room.progress.doneCount} / {room.progress.activeCount}명 완료
            </Muted>
          ) : null}
        </>
      ) : reveal ? (
        <Card style={{ gap: 8, borderColor: colors.correct }}>
          <Text style={[bodyFont(14, '700'), { color: colors.mintText }]}>정답</Text>
          <Text style={[titleFont(26), { color: colors.ink }]}>{reveal.reveal.answer}</Text>
          <Muted>{reveal.reveal.explanation}</Muted>
          <Muted>
            {reveal.correctParticipantIds.includes(meId) ? '맞혔어요! ' : ''}
            {reveal.correctParticipantIds.length}명이 맞혔어요 · {Math.max(0, Math.ceil((reveal.nextAt - t) / 1000))}초 뒤 다음
          </Muted>
        </Card>
      ) : null}
      {room.connection === 'reconnecting' ? <Muted style={{ textAlign: 'center' }}>연결이 끊겼어요. 다시 연결하는 중…</Muted> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 },
  board: { flexDirection: 'row', gap: 10 },
  scoreCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scoreMine: { backgroundColor: colors.primary, borderColor: colors.primary },
  qCard: { gap: 14, borderRadius: radius.xl },
  qHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  marker: { position: 'absolute', top: -5, width: 5, height: 22, borderRadius: 3, backgroundColor: colors.cheeseDark, marginLeft: -2 },
  timeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  hint: { color: colors.primary, textAlign: 'center' },
  bonus: { backgroundColor: colors.cheese, color: colors.ink, borderRadius: 8 },
  oxRow: { flexDirection: 'row', gap: 12 },
  feedback: { textAlign: 'center' },
});
