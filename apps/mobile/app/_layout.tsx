import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { startAudio } from '../src/audio';
import { WideSides } from '../src/components/WideSides';
import { startHaptics } from '../src/lib/haptics';
import { useMockApi } from '../src/lib/config';
import { session, useSession } from '../src/state/session';
import { colors, fontAssets } from '../src/theme';

if (useMockApi) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../mock');
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const { loaded } = useSession();
  useEffect(() => {
    // 웹에서도 기본 스크롤바는 숨긴다(스크롤은 그대로 동작)
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const style = document.createElement('style');
      style.textContent = '*{scrollbar-width:none}*::-webkit-scrollbar{display:none}';
      document.head.appendChild(style);
    }
    void session.load();
    startAudio();
    startHaptics();
  }, []);

  const ready = loaded && (fontsLoaded || !!fontError || Object.keys(fontAssets).length === 0);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {ready ? (
        <>
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.cream } }} />
          <WideSides />
        </>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </SafeAreaProvider>
  );
}
