import { Slot, usePathname, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { errorMessage } from '../../../src/api/client';
import { Button } from '../../../src/components/Button';
import { useLeaveGuard } from '../../../src/components/LeaveGuard';
import { Screen } from '../../../src/components/Screen';
import { ErrorText } from '../../../src/components/ui';
import { roomStore, useRoom } from '../../../src/state/room';
import { session } from '../../../src/state/session';
import { colors } from '../../../src/theme';

const ROUTE_BY_PHASE = { lobby: 'lobby', question: 'play', reveal: 'play', finished: 'result' } as const;

/** Keeps the room connection alive across lobby/play/result and routes by phase. */
export default function RoomLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { code } = useLocalSearchParams<{ code: string }>();
  const room = useRoom();
  const [error, setError] = useState<string | null>(null);

  // Page reload / deep link: re-enter with the stored token (the server resumes the seat).
  useEffect(() => {
    if (roomStore.get().code === code) return;
    if (!session.token()) {
      router.replace(`/join/${code}`);
      return;
    }
    roomStore.enter(code).catch((e: unknown) => setError(errorMessage(e)));
  }, [code, router]);

  const phase = room.snapshot?.phase;
  // 대결 중(문제·정답 공개)에는 나가기 전에 확인한다. 다른 참가자는 계속 대결한다.
  const guard = useLeaveGuard({
    active: phase === 'question' || phase === 'reveal',
    title: '대결에서 나갈까요?',
    message: '지금 나가면 남은 문제는 풀 수 없고, 이번 대결은 중도 퇴장으로 처리돼요.',
    onLeave: () => roomStore.leave(),
  });
  useEffect(() => {
    if (!phase || phase === 'dissolved') return;
    // Only steer between this room's own screens: a pushed screen (e.g. 오답노트 from the result)
    // keeps this layout mounted, and redirecting there would bounce the user straight back.
    if (!pathname.startsWith(`/room/${code}`)) return;
    const target = ROUTE_BY_PHASE[phase];
    if (!pathname.endsWith(`/${target}`)) router.replace(`/room/${code}/${target}`);
  }, [phase, pathname, code, router]);

  if (error || room.dissolved) {
    return (
      <Screen title="대결" back={false}>
        <ErrorText>{error ?? '방이 사라졌어요. 대기실이 30분 동안 시작되지 않으면 자동으로 닫혀요.'}</ErrorText>
        <Button label="홈으로" onPress={() => { roomStore.close(); router.dismissTo(session.get().member ? '/home' : `/join/${code}`); }} />
      </Screen>
    );
  }
  if (!room.snapshot) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <>
      <Slot />
      {guard.dialog}
    </>
  );
}
