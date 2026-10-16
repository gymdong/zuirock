import { DEFAULT_CONFIG } from '@zuirock/game-rules';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { errorMessage } from '../../src/api/client';
import { Api } from '../../src/api/endpoints';
import { Button } from '../../src/components/Button';
import { Mascot } from '../../src/components/Mascot';
import { Screen } from '../../src/components/Screen';
import { Card, ErrorText, Muted } from '../../src/components/ui';
import { planEscape } from '../../src/lib/inAppBrowser';
import { useAsync } from '../../src/lib/useAsync';
import { roomStore } from '../../src/state/room';
import { session, useSession } from '../../src/state/session';
import { bodyFont, colors, radius, titleFont } from '../../src/theme';

const { guestMin, guestMax } = DEFAULT_CONFIG.nickname;

/** Invite landing `/join/<code>`: escape in-app browsers, then member entry or guest nickname entry. */
export default function JoinLanding() {
  const router = useRouter();
  const { code, stay } = useLocalSearchParams<{ code: string; stay?: string }>();
  const { member, guest } = useSession();
  const [escapeHref, setEscapeHref] = useState<string | null>(null);
  const [nickname, setNickname] = useState(guest?.nickname ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const room = useAsync(() => Api.lookupRoom(code), [code]);

  useEffect(() => {
    if (Platform.OS !== 'web' || stay) return;
    const plan = planEscape(window.location.href, navigator.userAgent);
    if (plan.kind === 'redirect') {
      setEscapeHref(plan.href);
      window.location.href = plan.href;
    } else if (plan.kind === 'help') {
      router.replace({ pathname: '/join/help', params: { code, app: plan.app, os: plan.os } });
    }
  }, [code, stay, router]);

  const trimmed = nickname.trim();
  const nickOk = trimmed.length >= guestMin && trimmed.length <= guestMax;

  const enter = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!member) {
        if (!guest) await session.setGuest(await Api.createGuest(trimmed));
        await roomStore.enter(code, trimmed);
      } else {
        await roomStore.enter(code);
      }
      router.replace(`/room/${code}/lobby`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const info = room.data;
  return (
    <Screen title="대결 초대" back={() => router.replace(member ? '/home' : '/login')}>
      {escapeHref ? (
        <Card style={{ gap: 10 }}>
          <Text style={[titleFont(18), { color: colors.ink }]}>외부 브라우저에서 열어 주세요</Text>
          <Muted>앱 안의 브라우저에서는 대결이 끊길 수 있어요.</Muted>
          <Button size="md" label="브라우저로 열기" onPress={() => (window.location.href = escapeHref)} />
        </Card>
      ) : null}
      <Card style={styles.hero}>
        <Mascot size={110} mood="happy" />
        <Text style={[bodyFont(15, '700'), { color: colors.inkSoft }]}>방 코드</Text>
        <Text style={[titleFont(48), { color: colors.primary, letterSpacing: 8 }]}>{code}</Text>
        {info ? (
          <Muted style={{ textAlign: 'center' }}>
            {info.hostNickname}님의 방 · 참가자 {info.participantCount} / {info.maxPlayers}
          </Muted>
        ) : null}
        <ErrorText>{room.error}</ErrorText>
        {info && !info.joinable ? <ErrorText>지금은 들어갈 수 없는 방이에요 (가득 찼거나 이미 시작했어요).</ErrorText> : null}
      </Card>

      {member ? (
        <Button label={`${member.user.nickname}(으)로 입장하기`} onPress={enter} loading={busy} disabled={!info?.joinable} />
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={[titleFont(19), { color: colors.ink }]}>닉네임만 입력하고 바로 들어가요</Text>
          <TextInput
            value={nickname}
            onChangeText={(t) => setNickname(t.slice(0, guestMax))}
            placeholder={`닉네임 (${guestMin}~${guestMax}자)`}
            placeholderTextColor={colors.inkMuted}
            maxLength={guestMax}
            style={[styles.input, bodyFont(18, '700')]}
            accessibilityLabel="닉네임"
            onSubmitEditing={() => nickOk && info?.joinable && enter()}
          />
          <Muted>
            {trimmed.length} / {guestMax} · 같은 닉네임이 있으면 뒤에 숫자가 붙어요
          </Muted>
          <Button label="게스트로 입장하기" onPress={enter} loading={busy} disabled={!nickOk || !info?.joinable} />
          <Button
            variant="white"
            size="md"
            label="로그인하고 참여하기"
            onPress={() => router.push({ pathname: '/login', params: { next: `/join/${code}` } })}
          />
        </View>
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 4 },
  input: {
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.mouse,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    color: colors.ink,
  },
});
