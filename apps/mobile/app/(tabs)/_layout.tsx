import { Redirect } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../src/components/Icon';
import { useSession } from '../../src/state/session';
import { bodyFont, colors, MAX_CONTENT_WIDTH } from '../../src/theme';

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
          const color = active ? colors.white : colors.inkSoft;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => !active && navigation.navigate(route.name)}
              style={[styles.tab, active ? styles.active : null]}
            >
              <Icon name={tab.icon} size={26} color={color} />
              <Text style={[bodyFont(14, '800'), { color }]}>{tab.label}</Text>
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
  bar: { backgroundColor: colors.white, borderTopWidth: 2, borderTopColor: colors.border, paddingTop: 10 },
  row: { flexDirection: 'row', width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingHorizontal: 12 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, height: 64, borderRadius: 20 },
  active: { backgroundColor: colors.primary },
});
