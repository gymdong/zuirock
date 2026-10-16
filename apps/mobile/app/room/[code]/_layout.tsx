import { Slot, usePathname, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { errorMessage } from '../../../src/api/client';
import { Button } from '../../../src/components/Button';
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
  useEffect(() => {
    if (!phase || phase === 'dissolved') return;
    const target = ROUTE_BY_PHASE[phase];
    if (!pathname.endsWith(`/${target}`)) router.replace(`/room/${code}/${target}`);
  }, [phase, pathname, code, router]);

  if (error || room.dissolved) {
    return (
      <Screen title="대결" back={false}>
        <ErrorText>{error ?? '방이 사라졌어요. 대기실이 30분 동안 시작되지 않으면 자동으로 닫혀요.'}</ErrorText>
        <Button label="홈으로" onPress={() => { roomStore.close(); router.replace(session.get().member ? '/home' : `/join/${code}`); }} />
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
  return <Slot />;
}
