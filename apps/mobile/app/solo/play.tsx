import { TOPIC_NAME_BY_ID, type QuestionPublicDto, type QuestionRevealDto, type SetKind, type SetSessionDto, type TopicId, type UseSoloItemResponse } from '@zuirock/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
import Animated, { FadeInDown, FadeInRight, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { errorMessage } from '../../src/api/client';
import { Api } from '../../src/api/endpoints';
import { Button } from '../../src/components/Button';
import { ChosungBoxes, ChosungInput } from '../../src/components/ChosungInput';
import { Icon } from '../../src/components/Icon';
import { MyMascot } from '../../src/components/MyMascot';
import { CrumbBurst, FeverFrame } from '../../src/components/fx';
import { Pop, Shake } from '../../src/components/motion';
import { Shine, WrongFlash } from '../../src/components/fx2';
import { CheeseCap } from '../../src/components/theme/Drip';
import { useLeaveGuard } from '../../src/components/LeaveGuard';
import { ReportQuestion } from '../../src/components/ReportQuestion';
import { Screen } from '../../src/components/Screen';
import { Card, ErrorText, Muted, ProgressBar, Tag } from '../../src/components/ui';
import { SoloItemBar } from '../../src/features/economy/SoloItemBar';
import { withFirstChar } from '../../src/features/economy/logic';
import { TYPE_LABEL } from '../../src/lib/copy';
import { emit } from '../../src/lib/events';
import { soloResult } from '../../src/state/solo';
import { bodyFont, colors, titleFont } from '../../src/theme';

const BUDDY_LINES = ['차근차근 가요', '천천히 생각해 봐요', '할 수 있어요!', '집중, 집중!'];
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
  // 풀다가 나가면 확인을 받고, 세트를 통째로 버린다(이어 풀기 없음, 10/27).
  const guard = useLeaveGuard({
    active: !!set,
    title: '학습을 그만둘까요?',
    message: '지금 나가면 이 세트에서 푼 문제와 진행 상황이 저장되지 않아요.',
    onLeave: () => (set ? Api.abandonSet(set.setAttemptId) : Promise.resolve()),
  });

  /** Placement serves one adaptive question at a time; returns false when the test is over. */
  const fetchNext = async (s: SetSessionDto): Promise<boolean> => {
    const step = await Api.placementNext(s.setAttemptId);
    if (step.done) {
      soloResult.set = s;
      soloResult.placement = step.result;
      guard.allow();
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
      guard.allow();
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
      overlay={
        <>
          <WrongFlash trigger={wrongCount} />
          <FeverFrame level={combo >= 5 ? 2 : combo >= 3 ? 1 : 0} combo={combo} />
        </>
      }
      footer={
        reveal ? (
          // 결과는 위쪽 판정 알약에 바로 띄우고(아래에서 올라오는 시트는 느리게 느껴져 없앰), 아래에는 계속 버튼만 둔다.
          <Button
            label={set.kind === 'placement' || i + 1 < questions.length ? '계속' : '결과 보기'}
            onPress={next}
            loading={busy}
          />
        ) : null
      }
    >
      <View style={styles.progress}>
        <View style={{ flex: 1 }}>
          <ProgressBar value={set.kind === 'placement' ? Math.min(1, (i + 1) / 15) : (i + 1) / questions.length} track={colors.track} height={14} />
          {/* 마지막 문제를 맞히면 막대가 가득 찬 채로 빛이 한 번 훑고 지나간다 */}
          <Shine active={correct && set.kind !== 'placement' && i + 1 === questions.length} delay={250} radius={14} />
        </View>
        <Pop trigger={i}>
          <Text style={[titleFont(20), { color: colors.ink }]}>
            {set.kind === 'placement' ? `${i + 1}번째` : `${i + 1} / ${questions.length}`}
          </Text>
        </Pop>
      </View>
      <View style={styles.buddy}>
        <MyMascot size={76} motion={reveal ? (correct ? 'cheer' : 'sad') : 'idle'} motionFor={reveal ? 1900 : undefined} />
        <Animated.View
          key={`buddy-${q.id}-${reveal ? (correct ? 'y' : 'n') : 'q'}-${combo}`}
          entering={ZoomIn.duration(200).springify().damping(10).reduceMotion(ReduceMotion.System)}
          style={styles.buddyBubble}
        >
          <Text style={[bodyFont(15, '800'), { color: colors.ink }]}>
            {reveal ? (correct ? (combo >= 3 ? '불타고 있어요!' : '좋아요!') : '괜찮아요, 다음엔 맞힐 거예요') : combo >= 2 ? `${combo}연속 중이에요!` : i === 0 ? '첫 문제, 같이 풀어요!' : BUDDY_LINES[i % BUDDY_LINES.length]}
          </Text>
        </Animated.View>
      </View>
      {reveal ? (
        <Animated.View
          key={`verdict-${q.id}`}
          entering={ZoomIn.duration(140).reduceMotion(ReduceMotion.System)}
          style={[styles.verdict, { backgroundColor: correct ? colors.mintSoft : colors.coralSoft, borderColor: correct ? colors.correct : colors.wrong }]}
        >
          {correct ? <CrumbBurst count={18} power={combo >= 5 ? 1.3 : 1} /> : null}
          <Icon name={correct ? 'check' : 'close'} size={30} color={correct ? colors.mintText : colors.wrong} />
          <View style={{ flex: 1 }}>
            <Text style={[titleFont(22), { color: correct ? colors.mintText : colors.wrong }]}>{correct ? PRAISE[i % PRAISE.length] : '아쉬워요'}</Text>
            <Text style={[bodyFont(14, '800'), { color: correct ? colors.mintText : colors.wrong }]} numberOfLines={2}>
              {correct ? (combo >= 2 ? `${combo}연속 정답!` : '좋아요, 이대로 가요') : `정답: ${reveal.answer}`}
            </Text>
          </View>
        </Animated.View>
      ) : null}
      {combo >= 2 ? (
        <Pop trigger={combo} style={styles.combo}>
          <Text style={[titleFont(16), { color: colors.cheeseText }]}>{combo}연속 정답! 🔥</Text>
        </Pop>
      ) : null}

      <Animated.View key={`card-${q.id}`} entering={FadeInRight.duration(280).reduceMotion(ReduceMotion.System)}>
      <Card style={{ gap: 14, paddingTop: 30 }}>
        <CheeseCap />
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
        <Animated.View entering={ZoomIn.duration(150).reduceMotion(ReduceMotion.System)}>
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
      {guard.dialog}
    </Screen>
  );
}

const styles = StyleSheet.create({
  buddy: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  buddyBubble: { flexShrink: 1, backgroundColor: colors.white, borderRadius: 16, borderWidth: 2, borderBottomWidth: 4, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 2, borderBottomWidth: 4, paddingVertical: 8, paddingHorizontal: 14, overflow: 'hidden' },
  combo: { alignSelf: 'flex-start', backgroundColor: colors.cheeseSoft, borderRadius: 999, borderBottomWidth: 3, borderBottomColor: colors.cheese, paddingHorizontal: 14, paddingVertical: 6 },
});
