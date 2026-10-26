import { OAUTH_LOGIN_ORDER, type OAuthProvider } from '@zuirock/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { startLogin } from '../../src/api/auth';
import { errorMessage } from '../../src/api/client';
import { Button, type ButtonVariant } from '../../src/components/Button';
import { TapMascot } from '../../src/components/theme/TapMascot';
import { CheeseWheel } from '../../src/components/theme/CheeseWheel';
import { Bob, Twinkle } from '../../src/components/motion';
import { Screen } from '../../src/components/Screen';
import { ErrorText } from '../../src/components/ui';
import { bodyFont, colors, titleFont } from '../../src/theme';

const PROVIDER_BUTTON: Record<OAuthProvider, { label: string; variant: ButtonVariant }> = {
  kakao: { label: '카카오로 시작하기', variant: 'kakao' },
  naver: { label: '네이버로 시작하기', variant: 'naver' },
  google: { label: 'Google로 계속', variant: 'white' },
};

/** p2 로그인. Order: 카카오 (default) → 네이버 → Google. No Apple (no paid Apple program, plan v4). */
export default function Login() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const login = async (provider: OAuthProvider) => {
    setBusy(provider);
    setError(null);
    try {
      const s = await startLogin(provider, next ?? null);
      if (s) router.replace((next as never) ?? '/home');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <>
          {OAUTH_LOGIN_ORDER.map((p) => (
            <Button
              key={p}
              label={PROVIDER_BUTTON[p].label}
              variant={PROVIDER_BUTTON[p].variant}
              loading={busy === p}
              disabled={busy !== null && busy !== p}
              onPress={() => login(p)}
            />
          ))}
          <ErrorText>{error}</ErrorText>
          <Text style={[bodyFont(14), styles.note]}>
            친구에게 받은 대결 링크는 로그인 없이 바로 참여할 수 있어요.{'\n'}시작하면{' '}
            <Text style={styles.link}>이용약관</Text>과 <Text style={styles.link}>개인정보 처리방침</Text>에 동의하게 돼요.
          </Text>
        </>
      }
    >
      <View style={styles.hero}>
        <Animated.View entering={ZoomIn.springify().damping(9).reduceMotion(ReduceMotion.System)}>
          <View>
            <Twinkle style={{ top: 10, left: 6 }} size={9} color={colors.cheese} />
            <Twinkle style={{ top: 40, right: 0 }} size={7} delay={600} color={colors.mouse} />
            <Twinkle style={{ bottom: 30, left: 0 }} size={6} delay={1100} color={colors.ear} />
            <Bob distance={8}>
              <TapMascot size={220} />
            </Bob>
            <View style={{ marginTop: -46, alignItems: 'center' }}>
              <CheeseWheel size={250} />
            </View>
          </View>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(250).duration(360).reduceMotion(ReduceMotion.System)} style={{ alignItems: 'center', gap: 6 }}>
          <Text style={[titleFont(56, '900'), styles.logo]}>쥐락펴락</Text>
          <Text style={[bodyFont(18, '800'), { color: colors.ink }]}>뇌를 쥐락펴락, 매일 조금씩 쌓이는 교양</Text>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center' },
  hero: { alignItems: 'center', gap: 6 },
  logo: { color: colors.primary, letterSpacing: -1, marginTop: 8 },
  note: { color: colors.inkSoft, textAlign: 'center', lineHeight: 22, marginTop: 4 },
  link: { color: colors.primary, textDecorationLine: 'underline' },
});
