import { TOPIC_NAME_BY_ID, type QuestionRevealDto, type SetKind, type SetSessionDto, type TopicId } from '@zuirock/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../../src/api/client';
import { Api } from '../../src/api/endpoints';
import { Button } from '../../src/components/Button';
import { ChosungBoxes, ChosungInput } from '../../src/components/ChosungInput';
import { Screen } from '../../src/components/Screen';
import { Card, ErrorText, Muted, ProgressBar, Tag } from '../../src/components/ui';
import { TYPE_LABEL } from '../../src/lib/copy';
import { soloResult } from '../../src/state/solo';
import { bodyFont, colors, titleFont } from '../../src/theme';

const KIND_TITLE: Partial<Record<SetKind, string>> = {
  stage: '스테이지',
  composite: '종합',
  daily: '오늘의 3분 지식',
  quest: '약점 집중 퀘스트',
  diagnostic: '진단 세트',
};

/** Solo set: no timer (AC-S5); chosung hint by button; mcq/ox single submit; answer + explanation after each. */
export default function SoloPlay() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind: SetKind; topicId?: TopicId; subfieldId?: string }>();
  const [set, setSet] = useState<SetSessionDto | null>(null);
  const [i, setI] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [reveal, setReveal] = useState<QuestionRevealDto | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attempts = useRef(0);
  const shownAt = useRef(Date.now());

  useEffect(() => {
    Api.startSet({ kind: params.kind ?? 'composite', topicId: params.topicId, subfieldId: params.subfieldId }).then(setSet, (e: unknown) =>
      setError(errorMessage(e)),
    );
  }, [params.kind, params.topicId, params.subfieldId]);

  const q = set?.questions[i];
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
      if (r.final && r.reveal) setReveal(r.reveal);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
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
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const next = async () => {
    if (i + 1 < set.questions.length) {
      setI(i + 1);
      setHint(null);
      setReveal(null);
      setVerdict(null);
      setPicked(null);
      attempts.current = 0;
      shownAt.current = Date.now();
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
      footer={reveal ? <Button label={i + 1 < set.questions.length ? '다음 문제' : '결과 보기'} onPress={next} loading={busy} /> : null}
    >
      <View style={styles.progress}>
        <View style={{ flex: 1 }}>
          <ProgressBar value={(i + 1) / set.questions.length} track={colors.track} height={14} />
        </View>
        <Text style={[titleFont(20), { color: colors.ink }]}>
          {i + 1} / {set.questions.length}
        </Text>
      </View>

      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Tag label={`${TOPIC_NAME_BY_ID[q.topicId]} · ★${q.difficulty} · ${TYPE_LABEL[q.type]}`} />
          {set.reviewQuestionIds.includes(q.id) ? <Tag label="오답노트 복습" bg={colors.cheeseSoft} color={colors.cheeseText} /> : null}
        </View>
        <Text style={[titleFont(23), { color: colors.ink, lineHeight: 32 }]}>{q.question}</Text>
        {q.type === 'chosung' ? (
          <>
            <ChosungBoxes chosung={hint ?? undefined} length={q.answerLength ?? 0} />
            {!hint && !reveal ? (
              <Button variant="lavender" size="sm" label="초성 힌트 보기" onPress={showHint} style={{ alignSelf: 'center', width: 160 }} />
            ) : null}
            {!hint && !reveal ? <Muted style={{ textAlign: 'center' }}>힌트 없이 맞히면 노힌트 보너스 +20% XP</Muted> : null}
          </>
        ) : null}
      </Card>

      {!reveal ? (
        q.type === 'chosung' ? (
          <View style={{ gap: 8 }}>
            <ChosungInput onSubmit={submit} disabled={busy} />
            {verdict === 'near' ? <Text style={[bodyFont(16, '800'), { color: colors.cheeseText, textAlign: 'center' }]}>거의 비슷했어요!</Text> : null}
            {verdict === 'wrong' ? <Text style={[bodyFont(16, '800'), { color: colors.wrong, textAlign: 'center' }]}>오답이에요. 다시 입력해 보세요</Text> : null}
            <Button variant="white" size="sm" label="포기" onPress={giveUp} style={{ alignSelf: 'flex-end', width: 96 }} />
          </View>
        ) : (
          <View style={q.type === 'ox' ? { flexDirection: 'row', gap: 12 } : { gap: 10 }}>
            {(q.type === 'ox' ? ['O', 'X'] : (q.choices ?? [])).map((c) => (
              <Button key={c} variant={picked === c ? 'primary' : 'white'} label={c} disabled={busy} onPress={() => submit(c)} style={q.type === 'ox' ? { flex: 1 } : undefined} />
            ))}
          </View>
        )
      ) : (
        <Card style={{ gap: 8, borderColor: correct ? colors.correct : colors.wrong }}>
          <Text style={[titleFont(20), { color: correct ? colors.correct : colors.wrong }]}>{correct ? '정답이에요!' : '아쉬워요'}</Text>
          <Text style={[titleFont(24), { color: colors.ink }]}>{reveal.answer}</Text>
          <Muted>{reveal.explanation}</Muted>
          {reveal.source.title ? <Muted style={{ fontSize: 12 }}>출처 · {reveal.source.title}</Muted> : null}
        </Card>
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
