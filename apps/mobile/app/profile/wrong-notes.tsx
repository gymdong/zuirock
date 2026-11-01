import { TOPIC_IDS, TOPIC_NAME_BY_ID, type TopicId } from '@zuirock/shared';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '../../src/components/Text';
import { Api } from '../../src/api/endpoints';
import { ReportQuestion } from '../../src/components/ReportQuestion';
import { Mascot } from '../../src/components/Mascot';
import { Bob, Rise } from '../../src/components/motion';
import { Screen } from '../../src/components/Screen';
import { Card, ErrorText, Muted, Tag } from '../../src/components/ui';
import { TYPE_LABEL } from '../../src/lib/copy';
import { useAsync } from '../../src/lib/useAsync';
import { emit } from '../../src/lib/events';
import { bodyFont, colors, radius, titleFont } from '../../src/theme';

/** 오답노트: wrong answers with answer + explanation; '복습 완료' after one correct review (AC-D6). */
export default function WrongNotes() {
  const notes = useAsync(() => Api.wrongNotes(), []);
  const all = notes.data ?? [];
  // 주제별 보기: 오답이 있는 주제만 칩으로 보여 주고(개수 포함), 고르면 그 주제 문제만 남긴다
  const [topic, setTopic] = useState<TopicId | null>(null);
  const counts = new Map<TopicId, number>();
  for (const n of all) counts.set(n.question.topicId, (counts.get(n.question.topicId) ?? 0) + 1);
  const topics = TOPIC_IDS.filter((t) => counts.has(t));
  const active = topic && counts.has(topic) ? topic : null;
  const list = active ? all.filter((n) => n.question.topicId === active) : all;
  const chip = (id: TopicId | null, label: string, n: number) => {
    const on = active === id;
    return (
      <Pressable
        key={id ?? 'all'}
        testID={`wrong-filter-${id ?? 'all'}`}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => {
          emit('tap');
          setTopic(id);
        }}
        style={{
          paddingHorizontal: 14,
          height: 38,
          justifyContent: 'center',
          borderRadius: radius.pill,
          borderWidth: 2,
          borderBottomWidth: 4,
          borderColor: on ? colors.primaryDark : colors.border,
          backgroundColor: on ? colors.primary : colors.white,
        }}
      >
        <Text style={[bodyFont(14, '800'), { color: on ? colors.white : colors.ink }]}>
          {label} {n}
        </Text>
      </Pressable>
    );
  };
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
      {all.length > 0 && topics.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
          {chip(null, '전체', all.length)}
          {topics.map((t) => chip(t, TOPIC_NAME_BY_ID[t], counts.get(t) ?? 0))}
        </ScrollView>
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
