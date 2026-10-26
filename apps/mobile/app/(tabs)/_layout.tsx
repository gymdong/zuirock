import { Redirect } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../src/components/Icon';
import { useSession } from '../../src/state/session';
import { colors } from '../../src/theme';

const TABS: Array<{ name: string; label: string; icon: IconName }> = [
  { name: 'home/index', label: '홈', icon: 'home' },
  { name: 'battle/index', label: '대결', icon: 'battle' },
  { name: 'report/index', label: '리포트', icon: 'report' },
  { name: 'profile/index', label: '프로필', icon: 'profile' },
];

/** Bottom tabs 홈/대결/리포트/프로필 with the violet pill on the active tab (p5, p12). */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.row}>
        {state.routes.map((route, i) => {
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab) return null;
          const active = state.index === i;
          const color = active ? colors.white : colors.ink;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => !active && navigation.navigate(route.name)}
              style={[styles.tab, active ? styles.active : null]}
            >
              <Icon name={tab.icon} size={28} color={color} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { member } = useSession();
  if (!member) return <Redirect href="/login" />;
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // 떠 있는 라벤더 알약 막대, 아이콘만 (sample_img 시안, 10/26). 탭 이름은 accessibilityLabel로 읽힌다
  bar: { backgroundColor: colors.cream, paddingTop: 8, paddingHorizontal: 24 },
  row: { flexDirection: 'row', width: '100%', maxWidth: 360, alignSelf: 'center', padding: 6, gap: 4, borderRadius: 999, backgroundColor: colors.lavender },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 999 },
  active: { backgroundColor: colors.primary },
});
