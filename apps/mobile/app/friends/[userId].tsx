import { TOPIC_NAME_BY_ID } from '@zuirock/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../../src/api/client';
import { Api } from '../../src/api/endpoints';
import { Avatar } from '../../src/components/Avatar';
import { Button } from '../../src/components/Button';
import { CharacterLayers } from '../../src/components/CharacterLayers';
import { Screen } from '../../src/components/Screen';
import { Card, ErrorText, Muted } from '../../src/components/ui';
import { useAsync } from '../../src/lib/useAsync';
import { colors, radius, titleFont } from '../../src/theme';

/** p16 친구 프로필: level, character, topic levels, head-to-head (AC-A6). */
export default function FriendProfile() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const profile = useAsync(() => Api.friendProfile(userId), [userId]);
  // The friend DTO carries only item ids; the shared item catalog (my wardrobe) resolves the art.
  const catalog = useAsync(() => Api.wardrobe().then((w) => w.items).catch(() => []), []);
  const p = profile.data;
  const h = p?.headToHead;
  const [manage, setManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Screen
      title="친구 프로필"
      footer={
        <>
          {manage ? (
            <Card style={{ gap: 10 }}>
              <Text style={[titleFont(17), { color: colors.ink }]}>{p?.nickname}님을 친구에서 삭제할까요?</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button size="md" variant="white" label="취소" style={{ flex: 1 }} onPress={() => setManage(false)} />
                <Button
                  size="md"
                  variant="danger"
                  label="친구 삭제"
                  style={{ flex: 1 }}
                  onPress={() => Api.removeFriend(userId).then(() => router.replace('/friends'), (e: unknown) => setError(errorMessage(e)))}
                />
              </View>
            </Card>
          ) : null}
          <ErrorText>{error}</ErrorText>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="white" label="친구 관리" style={{ flex: 1 }} onPress={() => setManage(true)} />
            <Button label="대결 신청" style={{ flex: 1 }} onPress={() => router.push(`/battle/create?invite=${userId}`)} />
          </View>
        </>
      }
    >
      <ErrorText>{profile.error}</ErrorText>
      {p ? (
        <>
          <View style={styles.head}>
            <Avatar avatar={p.avatar} size={72} />
            <View style={{ flex: 1 }}>
              <Text style={[titleFont(26), { color: colors.ink }]}>{p.nickname}</Text>
              <Muted>
                Lv.{p.level.level} · 친구{h ? ` · 나와의 대결 ${h.wins}승 ${h.losses}패${h.draws ? ` ${h.draws}무` : ''}` : ''}
              </Muted>
            </View>
          </View>
          <Card style={{ alignItems: 'center', backgroundColor: colors.lavender, borderColor: colors.lavender, borderBottomColor: colors.lavenderStrong }}>
            <Muted>캐릭터</Muted>
            <CharacterLayers equipped={p.equipped} items={catalog.data ?? []} size={180} />
          </Card>
          <Text style={[titleFont(19), { color: colors.ink }]}>주제 레벨</Text>
          {p.topicLevels.length === 0 ? <Muted>아직 시작한 주제가 없어요</Muted> : null}
          <View style={styles.levels}>
            {p.topicLevels.map((t) => (
              <View key={t.topicId} style={styles.level}>
                <Text style={[titleFont(17), { color: colors.ink }]}>{TOPIC_NAME_BY_ID[t.topicId]}</Text>
                <Text style={[titleFont(17), { color: colors.primary }]}>Lv.{t.level}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  level: { width: '31%', padding: 12, gap: 4, borderRadius: radius.lg, borderWidth: 2, borderBottomWidth: 5, borderColor: colors.border, backgroundColor: colors.white },
});
