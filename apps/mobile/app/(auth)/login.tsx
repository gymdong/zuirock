import { OAUTH_LOGIN_ORDER, type LoginProvider } from '@zuirock/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../src/components/Text';
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

const PROVIDER_BUTTON: Record<LoginProvider, { label: string; variant: ButtonVariant }> = {
  kakao: { label: '카카오로 시작하기', variant: 'kakao' },
  google: { label: 'Google로 계속', variant: 'white' },
};

/**
 * 아직 열지 않은 로그인. 누르면 서버로 가지 않고 카카오로 안내한다. Google 은 OAuth 동의 화면이 '테스트' 상태라
 * 등록하지 않은 계정은 구글의 차단 화면을 보게 되므로 일단 막아 둔다. 열 때는 이 배열에서 'google' 만 지우면 된다.
 */
const COMING_SOON: readonly LoginProvider[] = ['google'];

/** p2 로그인. Order: 카카오 (default) → Google (네이버는 11/3에 뺐다). No Apple (no paid Apple program, plan v4). */
export default function Login() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [busy, setBusy] = useState<LoginProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const login = async (provider: LoginProvider) => {
    if (COMING_SOON.includes(provider)) {
      setError('Google 로그인은 준비 중이에요. 카카오로 시작해 주세요');
      return;
    }
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
              label={COMING_SOON.includes(p) ? `${PROVIDER_BUTTON[p].label} · 준비 중` : PROVIDER_BUTTON[p].label}
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
        <Animated.View entering={ZoomIn.springify().damping(22).stiffness(160).reduceMotion(ReduceMotion.System)}>
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
