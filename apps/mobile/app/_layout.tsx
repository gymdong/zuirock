import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
    void session.load();
  }, []);

  const ready = loaded && (fontsLoaded || !!fontError || Object.keys(fontAssets).length === 0);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {ready ? (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </SafeAreaProvider>
  );
}
