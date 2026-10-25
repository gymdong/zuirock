import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { on } from './events';

/** Phone vibration for UI moments (game feel). No-op on web; failures are ignored. */
let started = false;
export function startHaptics(): void {
  if (started || Platform.OS === 'web') return;
  started = true;
  const safe = (p: Promise<void>) => void p.catch(() => undefined);
  on('tap', () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)));
  on('correct', () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)));
  on('wrong', () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)));
  on('levelUp', () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)));
  on('victory', () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)));
  on('chestOpen', () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)));
}
