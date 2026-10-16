import { TOPIC_NAME_BY_ID } from '@zuirock/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
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
  const p = profile.data;
  const h = p?.headToHead;
  return (
    <Screen
      title="친구 프로필"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="white" label="친구 관리" style={{ flex: 1 }} onPress={() => router.push('/friends')} />
          <Button label="대결 신청" style={{ flex: 1 }} onPress={() => router.push('/battle/create')} />
        </View>
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
          <Card style={{ alignItems: 'center', backgroundColor: colors.lavender, borderColor: colors.lavender }}>
            <Muted>캐릭터</Muted>
            <CharacterLayers equipped={p.equipped} items={[]} size={180} />
          </Card>
          <Text style={[titleFont(19), { color: colors.ink }]}>주제 레벨</Text>
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
  level: { width: '31%', padding: 12, gap: 4, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white },
});
