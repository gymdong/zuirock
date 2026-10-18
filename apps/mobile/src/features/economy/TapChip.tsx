import { useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { emit } from '../../lib/events';

/** Home header chip that opens a screen (streak → /streak, cheese → /shop; item 2). */
export function TapChip({ href, label, style, children }: { href: Href; label: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        emit('tap');
        router.push(href);
      }}
      style={({ pressed }) => [style, pressed ? { opacity: 0.7, transform: [{ scale: 0.95 }] } : null]}
    >
      {children}
    </Pressable>
  );
}
