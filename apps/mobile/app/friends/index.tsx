import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Api } from '../../src/api/endpoints';
import { Avatar } from '../../src/components/Avatar';
import { Screen } from '../../src/components/Screen';
import { ErrorText, Muted } from '../../src/components/ui';
import { useAsync } from '../../src/lib/useAsync';
import { colors, radius, titleFont } from '../../src/theme';

/** 친구 목록 (AC-A5). Server endpoints are LB pass 2; runs against the mock for now. */
export default function Friends() {
  const router = useRouter();
  const list = useAsync(() => Api.friends(), []);
  const friends = list.data?.friends ?? [];
  return (
    <Screen title={`친구 ${friends.length}명`}>
      <ErrorText>{list.error}</ErrorText>
      {!list.loading && !list.error && friends.length === 0 ? <Muted>아직 친구가 없어요. 대결한 친구에게 친구 신청을 보내 보세요.</Muted> : null}
      {friends.map((f) => (
        <Pressable key={f.userId} style={styles.row} onPress={() => router.push(`/friends/${f.userId}`)}>
          <Avatar avatar={f.avatar} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={[titleFont(18), { color: colors.ink }]}>{f.nickname}</Text>
            <Muted>Lv.{f.level}</Muted>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border },
});
