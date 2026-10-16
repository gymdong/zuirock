import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { errorMessage } from '../../src/api/client';
import { Api } from '../../src/api/endpoints';
import { Button } from '../../src/components/Button';
import { Screen } from '../../src/components/Screen';
import { Card, ErrorText, Muted } from '../../src/components/ui';
import { session, useSession } from '../../src/state/session';
import { colors, titleFont } from '../../src/theme';

const PROVIDER_NAME = { kakao: '카카오', naver: '네이버', google: 'Google' } as const;
type Pending = 'records' | 'account' | null;

/** 로그인 계정 관리: 학습 기록 전체 삭제 / 회원 탈퇴 (AC-D7). Both ask for a second tap. */
export default function Account() {
  const router = useRouter();
  const me = useSession().member?.user;
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (pending === 'records') {
        await Api.deleteLearningRecords();
        await session.updateMe(await Api.me());
        setMsg('학습 기록을 모두 지웠어요. 레벨과 XP도 처음부터 시작해요.');
      } else {
        await Api.deleteAccount();
        await session.logout();
        router.replace('/login');
        return;
      }
      setPending(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="계정 관리">
      <Card style={{ gap: 4 }}>
        <Text style={[titleFont(18), { color: colors.ink }]}>로그인 계정</Text>
        <Muted>{me.providers.map((p) => PROVIDER_NAME[p]).join(' · ')} 연결됨</Muted>
      </Card>
      <Card style={{ gap: 8 }}>
        <Text style={[titleFont(18), { color: colors.ink }]}>학습 기록 전체 삭제</Text>
        <Muted>풀이 기록·오답노트·리포트를 지우고 레벨과 XP를 처음으로 돌려요. 되돌릴 수 없어요.</Muted>
        <Button size="md" variant="white" label="학습 기록 삭제" onPress={() => setPending('records')} />
      </Card>
      <Card style={{ gap: 8 }}>
        <Text style={[titleFont(18), { color: colors.ink }]}>회원 탈퇴</Text>
        <Muted>계정과 모든 데이터를 지워요. 되돌릴 수 없어요.</Muted>
        <Button size="md" variant="white" label="회원 탈퇴" onPress={() => setPending('account')} />
      </Card>
      {pending ? (
        <Card style={{ gap: 10, borderColor: colors.wrong }}>
          <Text style={[titleFont(17), { color: colors.wrong }]}>
            {pending === 'records' ? '정말 학습 기록을 모두 지울까요?' : '정말 탈퇴할까요?'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button size="md" variant="white" label="취소" style={{ flex: 1 }} onPress={() => setPending(null)} />
            <Button size="md" variant="danger" label={pending === 'records' ? '모두 삭제' : '탈퇴하기'} style={{ flex: 1 }} loading={busy} onPress={run} />
          </View>
        </Card>
      ) : null}
      {msg ? <Muted style={{ color: colors.mintText }}>{msg}</Muted> : null}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
