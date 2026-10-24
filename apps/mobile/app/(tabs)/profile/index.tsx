import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Api } from '../../../src/api/endpoints';
import { Avatar } from '../../../src/components/Avatar';
import { Button } from '../../../src/components/Button';
import { Mascot } from '../../../src/components/Mascot';
import { AnimatedNumber, Bob, PressScale, Rise } from '../../../src/components/motion';
import { Screen } from '../../../src/components/Screen';
import { Card, Muted, Tag } from '../../../src/components/ui';
import { useAsync } from '../../../src/lib/useAsync';
import { session, useSession } from '../../../src/state/session';
import { bodyFont, colors, radius, titleFont } from '../../../src/theme';

const PROVIDER_NAME = { kakao: '카카오', naver: '네이버', google: 'Google' } as const;

/** p13 프로필. */
export default function Profile() {
  const router = useRouter();
  const me = useSession().member?.user;
  const data = useAsync(
    () => Promise.all([Api.streak().catch(() => null), Api.history().catch(() => null), Api.wrongNotes().catch(() => null), Api.friends().catch(() => null)]),
    [],
  );
  if (!me) return null;
  const [streak, history, notes, friends] = data.data ?? [null, null, null, null];
  const providers = me.providers.map((p) => PROVIDER_NAME[p]).join(' · ');
  const rows: Array<[string, string, () => void]> = [
    ['친구', friends ? `${friends.friends.length}명` : '', () => router.push('/friends')],
    ['오답노트', notes ? `${notes.filter((n) => n.status === 'open').length}문제` : '', () => router.push('/profile/wrong-notes')],
    ['내 주제 관리', `${me.selectedTopicIds.length}개`, () => router.push('/topics/select')],
    ['로그인 계정 관리', `${providers} 연결됨`, () => router.push('/profile/account')],
    ['설정', '소리', () => router.push('/settings')],
  ];
  const stats: Array<[string, number | null, string]> = [
    ['푼 문제', history ? history.totalSolved : null, ''],
    ['대결', history ? history.battles.wins : null, '승'],
    ['최장 연속', streak ? streak.longest : null, '일'],
  ];

  return (
    <Screen title="프로필" back={false} edges={['top']}>
      <Rise i={0}>
      <Card style={styles.head}>
        <Avatar avatar={me.avatar} size={76} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[titleFont(24), { color: colors.ink }]} numberOfLines={1}>{me.nickname}</Text>
          <Muted>
            Lv.{me.level.level}
            {streak?.current ? ` · ${streak.current}일 연속 학습 중` : ''}
          </Muted>
          <Tag label={providers} bg={colors.kakao} style={{ marginTop: 4 }} />
        </View>
        <Button size="sm" variant="white" label="편집" onPress={() => router.push('/profile/edit')} style={{ width: 72 }} />
      </Card>
      </Rise>

      <Rise i={1}>
      <Card style={styles.character}>
        <Bob distance={5}>
          <Mascot size={110} />
        </Bob>
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={[titleFont(19), { color: colors.ink }]}>내 캐릭터</Text>
          <Button size="sm" variant="lavender" label="캐릭터 꾸미기" onPress={() => router.push('/profile/character')} />
        </View>
      </Card>
      </Rise>

      <View style={styles.stats}>
        {stats.map(([label, value, suffix], idx) => (
          <Rise key={label} i={idx + 2} style={{ flex: 1 }}>
            <View style={styles.stat}>
              {value === null ? (
                <Text style={[titleFont(22), { color: colors.ink }]}>–</Text>
              ) : (
                <AnimatedNumber value={value} suffix={suffix} style={[titleFont(22), { color: colors.ink }]} />
              )}
              <Muted>{label}</Muted>
            </View>
          </Rise>
        ))}
      </View>

      {rows.map(([title, sub, onPress], idx) => (
        <Rise key={title} i={idx + 5} step={50}>
          <PressScale onPress={onPress} to={0.97} style={styles.row}>
            <Text style={[bodyFont(17, '800'), { color: colors.ink, flex: 1 }]}>{title}</Text>
            <Muted>{sub}</Muted>
          </PressScale>
        </Rise>
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  character: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.lavender, borderColor: colors.lavender },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { alignItems: 'center', paddingVertical: 14, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: 18, borderWidth: 2, borderColor: colors.border, padding: 18 },
});
