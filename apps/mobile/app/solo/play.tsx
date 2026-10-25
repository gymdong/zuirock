import { TOPIC_NAME_BY_ID, type QuestionPublicDto, type QuestionRevealDto, type SetKind, type SetSessionDto, type TopicId, type UseSoloItemResponse } from '@zuirock/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight, ReduceMotion, SlideInDown, ZoomIn } from 'react-native-reanimated';
import { errorMessage } from '../../src/api/client';
import { Api } from '../../src/api/endpoints';
import { Button } from '../../src/components/Button';
import { ChosungBoxes, ChosungInput } from '../../src/components/ChosungInput';
import { Mascot } from '../../src/components/Mascot';
import { Confetti, Pop, Shake } from '../../src/components/motion';
import { ReportQuestion } from '../../src/components/ReportQuestion';
import { Screen } from '../../src/components/Screen';
import { Card, ErrorText, Muted, ProgressBar, Tag } from '../../src/components/ui';
import { SoloItemBar } from '../../src/features/economy/SoloItemBar';
import { withFirstChar } from '../../src/features/economy/logic';
import { TYPE_LABEL } from '../../src/lib/copy';
import { emit } from '../../src/lib/events';
import { soloResult } from '../../src/state/solo';
import { bodyFont, colors, titleFont } from '../../src/theme';

const PRAISE = ['정답이에요!', '완벽해요!', '대단해요!', '척척박사!'];

const KIND_TITLE: Partial<Record<SetKind, string>> = {
  stage: '스테이지',
  composite: '종합',
  daily: '오늘의 3분 지식',
  quest: '약점 집중 퀘스트',
  diagnostic: '진단 세트',
  placement: '레벨테스트',
  basic_test: '기초 테스트',
};

/** Solo set: no timer (AC-S5); chosung hint by button; mcq/ox single submit; answer + explanation after each. */
export default function SoloPlay() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind: SetKind; topicId?: TopicId; subfieldId?: string; checkpointLevel?: string }>();
  const [set, setSet] = useState<SetSessionDto | null>(null);
  const [questions, setQuestions] = useState<QuestionPublicDto[]>([]);
  const [i, setI] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [reveal, setReveal] = useState<QuestionRevealDto | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [item, setItem] = useState<UseSoloItemResponse | null>(null);
  const [combo, setCombo] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const attempts = useRef(0);
  const shownAt = useRef(Date.now());

  /** Placement serves one adaptive question at a time; returns false when the test is over. */
  const fetchNext = async (s: SetSessionDto): Promise<boolean> => {
    const step = await Api.placementNext(s.setAttemptId);
    if (step.done) {
      soloResult.set = s;
      soloResult.placement = step.result;
      router.replace('/solo/placement');
      return false;
    }
    setQuestions((qs) => [...qs, step.question]);
    return true;
  };

  useEffect(() => {
    Api.startSet({
      kind: params.kind ?? 'composite',
      topicId: params.topicId,
      subfieldId: params.subfieldId,
      checkpointLevel: params.checkpointLevel ? Number(params.checkpointLevel) : undefined,
    }).then(
      async (s) => {
        setSet(s);
        if (s.kind === 'placement') await fetchNext(s);
        else setQuestions(s.questions);
      },
      (e: unknown) => setError(errorMessage(e)),
    );
  }, [params.kind, params.topicId, params.subfieldId, params.checkpointLevel]);

  const q = questions[i];
  if (!set || !q) {
    return (
      <Screen title={KIND_TITLE[params.kind ?? 'composite'] ?? '학습'}>
        <ErrorText>{error}</ErrorText>
        {!error ? <Muted>문제를 고르는 중…</Muted> : null}
      </Screen>
    );
  }

  const submit = async (answer: string) => {
    setBusy(true);
    setError(null);
    attempts.current += 1;
    if (q.type !== 'chosung') setPicked(answer);
    try {
      const r = await Api.submitSolo(
        set.setAttemptId,
        { questionId: q.id, answer, responseMs: Date.now() - shownAt.current, hintUsed: hint !== null },
        attempts.current,
      );
      setVerdict(r.verdict);
      if (r.final && r.reveal) {
        setReveal(r.reveal);
        settle(r.verdict === 'correct');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** Question finished: sound + combo bookkeeping. */
  const settle = (ok: boolean) => {
    emit(ok ? 'correct' : 'wrong');
    setCombo((c) => (ok ? c + 1 : 0));
    if (!ok) setWrongCount((n) => n + 1);
  };

  const showHint = async () => {
    try {
      setHint((await Api.soloHint(set.setAttemptId, q.id)).chosung);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const giveUp = async () => {
    try {
      setVerdict('wrong');
      setReveal((await Api.soloGiveUp(set.setAttemptId, q.id)).reveal);
      settle(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const resetQuestion = () => {
    setHint(null);
    setItem(null);
    setReveal(null);
    setVerdict(null);
    setPicked(null);
    attempts.current = 0;
    shownAt.current = Date.now();
  };

  const next = async () => {
    if (set.kind === 'placement') {
      setBusy(true);
      try {
        if (await fetchNext(set)) {
          setI(i + 1);
          resetQuestion();
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (i + 1 < questions.length) {
      setI(i + 1);
      resetQuestion();
      return;
    }
    setBusy(true);
    try {
      soloResult.set = set;
      soloResult.result = await Api.completeSet(set.setAttemptId);
      router.replace('/solo/result');
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const title = `${KIND_TITLE[set.kind] ?? '학습'}${set.topicId ? ` · ${TOPIC_NAME_BY_ID[set.topicId]}` : ''}${set.kind === 'stage' && set.level ? ` Lv.${set.level}` : ''}`;
  const correct = verdict === 'correct';

  return (
    <Screen
      title={title}
      footer={
        reveal ? (
          // Duolingo-style result sheet: green/red panel slides up with the verdict and the continue button.
          <Animated.View
            key={`sheet-${q.id}`}
            entering={SlideInDown.duration(260).reduceMotion(ReduceMotion.System)}
            style={[styles.sheet, { backgroundColor: correct ? colors.mintSoft : colors.coralSoft }]}
          >
            {correct ? <Confetti count={18} style={{ top: 0 }} /> : null}
            <View style={styles.sheetHead}>
              <Shake trigger={correct ? 0 : wrongCount}>
                <Mascot size={56} mood={correct ? 'happy' : 'surprised'} blink={false} />
              </Shake>
              <View style={{ flex: 1 }}>
                <Text style={[titleFont(24), { color: correct ? colors.mintText : colors.wrong }]}>{correct ? PRAISE[i % PRAISE.length] : '아쉬워요'}</Text>
                <Text style={[bodyFont(15, '800'), { color: correct ? colors.mintText : colors.wrong }]} numberOfLines={2}>
                  {correct ? (combo >= 2 ? `${combo}연속 정답!` : '좋아요, 이대로 가요') : `정답: ${reveal.answer}`}
                </Text>
              </View>
            </View>
            <Button
              label={set.kind === 'placement' || i + 1 < questions.length ? '계속' : '결과 보기'}
              onPress={next}
              loading={busy}
            />
          </Animated.View>
        ) : null
      }
    >
      <View style={styles.progress}>
        <View style={{ flex: 1 }}>
          <ProgressBar value={set.kind === 'placement' ? Math.min(1, (i + 1) / 15) : (i + 1) / questions.length} track={colors.track} height={14} />
        </View>
        <Text style={[titleFont(20), { color: colors.ink }]}>
          {set.kind === 'placement' ? `${i + 1}번째` : `${i + 1} / ${questions.length}`}
        </Text>
      </View>
      {combo >= 2 ? (
        <Pop trigger={combo} style={styles.combo}>
          <Text style={[titleFont(16), { color: colors.cheeseText }]}>{combo}연속 정답! 🔥</Text>
        </Pop>
      ) : null}

      <Animated.View key={`card-${q.id}`} entering={FadeInRight.duration(280).reduceMotion(ReduceMotion.System)}>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Tag label={`${TOPIC_NAME_BY_ID[q.topicId]} · ★${q.difficulty} · ${TYPE_LABEL[q.type]}`} />
          {set.reviewQuestionIds.includes(q.id) ? <Tag label="오답노트 복습" bg={colors.cheeseSoft} color={colors.cheeseText} /> : null}
        </View>
        <Text style={[titleFont(23), { color: colors.ink, lineHeight: 32 }]}>{q.question}</Text>
        {q.type === 'chosung' ? (
          <>
            <ChosungBoxes chosung={withFirstChar(hint, item?.chosungFirst) ?? undefined} length={q.answerLength ?? 0} />
            {!hint && !reveal ? (
              <Button variant="lavender" size="sm" label="초성 힌트 보기" onPress={showHint} style={{ alignSelf: 'center', width: 160 }} />
            ) : null}
            {!hint && !item && !reveal ? <Muted style={{ textAlign: 'center' }}>힌트 없이 맞히면 노힌트 보너스 +20% XP</Muted> : null}
          </>
        ) : null}
      </Card>
      </Animated.View>

      {!reveal ? <SoloItemBar setId={set.setAttemptId} question={q} onUsed={setItem} /> : null}
      {q.type === 'chosung' ? (
        !reveal ? (
          <View style={{ gap: 8 }}>
            <ChosungInput onSubmit={submit} disabled={busy} />
            {verdict === 'near' ? <Text style={[bodyFont(16, '800'), { color: colors.cheeseText, textAlign: 'center' }]}>거의 비슷했어요!</Text> : null}
            {verdict === 'wrong' ? <Text style={[bodyFont(16, '800'), { color: colors.wrong, textAlign: 'center' }]}>오답이에요. 다시 입력해 보세요</Text> : null}
            <Button variant="white" size="sm" label="포기" onPress={giveUp} style={{ alignSelf: 'flex-end', width: 96 }} />
          </View>
        ) : null
      ) : (
        <View key={`choices-${q.id}`} style={q.type === 'ox' ? { flexDirection: 'row', gap: 12 } : { gap: 10 }}>
          {(q.type === 'ox' ? ['O', 'X'] : (q.choices ?? []).filter((c) => c !== item?.removedChoice)).map((c, idx) => {
            // After the reveal the answer turns mint and a wrong pick turns coral, so the result is visible on the buttons themselves.
            const isAnswer = !!reveal && c === reveal.answer;
            const isWrongPick = !!reveal && !correct && c === picked;
            const variant = isAnswer ? 'correct' : isWrongPick ? 'danger' : picked === c && !reveal ? 'primary' : 'white';
            return (
              <Animated.View
                key={c}
                entering={FadeInDown.delay(idx * 60).duration(240).reduceMotion(ReduceMotion.System)}
                style={q.type === 'ox' ? { flex: 1 } : undefined}
              >
                <Shake trigger={isWrongPick ? wrongCount : 0}>
                  <Button testID={`choice-${idx}`} variant={variant} label={c} disabled={busy} onPress={() => (reveal ? undefined : submit(c))} style={reveal && !isAnswer && !isWrongPick ? { opacity: 0.45 } : undefined} />
                </Shake>
              </Animated.View>
            );
          })}
        </View>
      )}
      {reveal ? (
        <Animated.View entering={ZoomIn.duration(260).reduceMotion(ReduceMotion.System)}>
          <Card style={{ gap: 8, borderColor: correct ? colors.correct : colors.wrong }}>
            <Text style={[bodyFont(14, '800'), { color: colors.inkSoft }]}>정답과 해설</Text>
            <Text style={[titleFont(24), { color: colors.ink }]}>{reveal.answer}</Text>
            <Muted>{reveal.explanation}</Muted>
            {reveal.source.title ? <Muted style={{ fontSize: 12 }}>출처 · {reveal.source.title}</Muted> : null}
            <ReportQuestion key={q.id} questionId={q.id} />
          </Card>
        </Animated.View>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sheet: { borderRadius: 24, padding: 16, gap: 12, overflow: 'hidden', marginHorizontal: -8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  combo: { alignSelf: 'flex-start', backgroundColor: colors.cheeseSoft, borderRadius: 999, borderBottomWidth: 3, borderBottomColor: colors.cheese, paddingHorizontal: 14, paddingVertical: 6 },
});
