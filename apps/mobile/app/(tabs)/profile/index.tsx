import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { Mascot } from '../../../src/components/Mascot';
import { Screen } from '../../../src/components/Screen';
import { Card, Muted } from '../../../src/components/ui';
import { session, useSession } from '../../../src/state/session';
import { bodyFont, colors, titleFont } from '../../../src/theme';

/** 프로필 탭 (pass 1: entry points only; p13/p14 come in pass 2). */
export default function Profile() {
  const router = useRouter();
  const me = useSession().member?.user;
  if (!me) return null;
  const rows: Array<[string, string, () => void]> = [
    ['오답노트', '틀린 문제 다시 보기', () => router.push('/profile/wrong-notes')],
    ['내 주제 관리', `${me.selectedTopicIds.length}개`, () => router.push('/topics/select')],
    ['로그인 계정', me.providers.map((p) => ({ kakao: '카카오', naver: '네이버', google: 'Google' })[p]).join(' · ') + ' 연결됨', () => {}],
  ];
  return (
    <Screen title="프로필" back={false} edges={['top']}>
      <Card style={styles.head}>
        <Mascot size={88} />
        <View style={{ flex: 1 }}>
          <Text style={[titleFont(24), { color: colors.ink }]}>{me.nickname}</Text>
          <Muted>
            Lv.{me.level.level} · 치즈 {me.cheese}
          </Muted>
        </View>
      </Card>
      {rows.map(([title, sub, onPress]) => (
        <Pressable key={title} onPress={onPress} style={styles.row}>
          <Text style={[bodyFont(17, '800'), { color: colors.ink, flex: 1 }]}>{title}</Text>
          <Muted>{sub}</Muted>
        </Pressable>
      ))}
      <Button
        variant="white"
        size="md"
        label="로그아웃"
        onPress={async () => {
          await session.logout();
          router.replace('/login');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 18,
  },
});
