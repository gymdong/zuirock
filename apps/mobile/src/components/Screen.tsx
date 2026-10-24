import { useRouter } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, MAX_CONTENT_WIDTH, titleFont } from '../theme';
import { Icon } from './Icon';

interface Props {
  children: ReactNode;
  /** Pinned below the scroll area (main CTA). */
  footer?: ReactNode;
  scroll?: boolean;
  title?: string;
  /** Show a back chevron (defaults to true when a title is set). */
  back?: boolean | (() => void);
  right?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: Array<'top' | 'bottom'>;
  /** Open scrolled to the bottom (stage road: current level sits at the bottom). */
  startAtEnd?: boolean;
}

/** Cream page with a phone-width column (centered on wide web viewports). */
export function Screen({ children, footer, scroll = true, title, back, right, contentStyle, edges = ['top', 'bottom'], startAtEnd }: Props) {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const jumped = useRef(false);
  const showBack = back ?? !!title;
  const onBack = typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/home'));
  const header = title ? (
    <View style={styles.header}>
      {showBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={onBack} hitSlop={12} style={styles.back}>
          <Icon name="back" size={26} color={colors.ink} />
        </Pressable>
      ) : null}
      <Text style={[titleFont(26), styles.title]} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  ) : null;
  // Soft fade/rise on every screen (item 4); entering animations honour reduce motion.
  const body = (
    <Animated.View entering={FadeInDown.duration(240).reduceMotion(ReduceMotion.System)} style={[styles.content, contentStyle]}>
      {header}
      {children}
    </Animated.View>
  );
  return (
    <SafeAreaView style={styles.root} edges={edges}>
      <View style={styles.column}>
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (startAtEnd && !jumped.current) {
                jumped.current = true;
                scrollRef.current?.scrollToEnd({ animated: false });
              }
            }}
          >
            {body}
          </ScrollView>
        ) : (
          body
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  column: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  scroll: { flexGrow: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  title: { flex: 1, color: colors.ink },
  footer: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8, gap: 8 },
});
