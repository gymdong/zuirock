import { TOPIC_NAME_BY_ID } from '@zuirock/shared';
import { Text, View } from 'react-native';
import { Api } from '../../src/api/endpoints';
import { ReportQuestion } from '../../src/components/ReportQuestion';
import { Mascot } from '../../src/components/Mascot';
import { Bob, Rise } from '../../src/components/motion';
import { Screen } from '../../src/components/Screen';
import { Card, ErrorText, Muted, Tag } from '../../src/components/ui';
import { TYPE_LABEL } from '../../src/lib/copy';
import { useAsync } from '../../src/lib/useAsync';
import { bodyFont, colors, titleFont } from '../../src/theme';

/** 오답노트: wrong answers with answer + explanation; '복습 완료' after one correct review (AC-D6). */
export default function WrongNotes() {
  const notes = useAsync(() => Api.wrongNotes(), []);
  const list = notes.data ?? [];
  return (
    <Screen title="오답노트">
      <ErrorText>{notes.error}</ErrorText>
      {!notes.loading && list.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 8 }}>
          <Bob distance={4}>
            <Mascot size={110} mood="happy" />
          </Bob>
          <Muted style={{ textAlign: 'center' }}>아직 틀린 문제가 없어요. 대결이나 솔로 학습에서 틀린 문제가 여기 모여요.</Muted>
        </Card>
      ) : null}
      {list.length > 0 ? (
        <Muted>
          {list.length}문제 · 솔로 세트를 풀면 오답노트 문제가 최대 2개씩 섞여 나와요. 한 번 맞히면 복습 완료!
        </Muted>
      ) : null}
      {list.map((n, idx) => (
        <Rise key={n.questionId} i={idx} step={60}>
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Tag label={`${TOPIC_NAME_BY_ID[n.question.topicId]} · ${n.question.subfield}`} />
            <Tag label={TYPE_LABEL[n.question.type]} />
            {n.status === 'reviewed' ? (
              <Tag label="복습 완료" bg={colors.mintSoft} color={colors.mintText} />
            ) : (
              <Tag label={`${n.wrongCount}번 틀림`} bg={colors.coralSoft} color={colors.wrong} />
            )}
          </View>
          <Text style={[bodyFont(17, '700'), { color: colors.ink, lineHeight: 25 }]}>{n.question.question}</Text>
          <Text style={[titleFont(19), { color: colors.correct }]}>정답 · {n.reveal.answer}</Text>
          <Muted>{n.reveal.explanation}</Muted>
          {n.reveal.source.title ? <Muted style={{ fontSize: 12 }}>출처 · {n.reveal.source.title}</Muted> : null}
          <ReportQuestion questionId={n.questionId} />
        </Card>
        </Rise>
      ))}
    </Screen>
  );
}
