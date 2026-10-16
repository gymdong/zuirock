import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { completeLogin, loginErrorMessage } from '../../src/api/auth';
import { errorMessage } from '../../src/api/client';
import { Button } from '../../src/components/Button';
import { Screen } from '../../src/components/Screen';
import { ErrorText, Muted } from '../../src/components/ui';
import { colors } from '../../src/theme';

/** OAuth return: `?code=<one-time exchange code>` or `?error=` from the server callback. */
export default function AuthCallback() {
  const router = useRouter();
  const { code, error } = useLocalSearchParams<{ code?: string; error?: string }>();
  const [failure, setFailure] = useState<string | null>(error ? loginErrorMessage(error) : null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !code) return;
    started.current = true;
    completeLogin(code).then(
      ({ next }) => router.replace((next as never) ?? '/home'),
      (e: unknown) => setFailure(errorMessage(e)),
    );
  }, [code, router]);

  return (
    <Screen contentStyle={{ justifyContent: 'center', alignItems: 'center' }}>
      {failure || !code ? (
        <View style={{ gap: 12, width: '100%' }}>
          <ErrorText>{failure ?? loginErrorMessage('')}</ErrorText>
          <Button label="다시 로그인하기" onPress={() => router.replace('/login')} />
        </View>
      ) : (
        <>
          <ActivityIndicator color={colors.primary} />
          <Muted>로그인하는 중…</Muted>
        </>
      )}
    </Screen>
  );
}
