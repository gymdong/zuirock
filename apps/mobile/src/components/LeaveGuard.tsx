import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text } from 'react-native';
import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { colors, radius, titleFont } from '../theme';
import { Button } from './Button';
import { Muted } from './ui';

interface Options {
  /** Ask before leaving while true (a set or battle is in progress). */
  active: boolean;
  title: string;
  message: string;
  /** Runs after the user confirms, before the screen goes away (abandon the set, leave the room). */
  onLeave: () => Promise<unknown>;
}

/**
 * Confirms every way off a play screen (header back, close button, Android back)
 * while `active` (web browser back: see below). The iOS swipe-back is turned off meanwhile so it cannot skip the question.
 * Call `allow()` right before navigating away on purpose (to the result screen).
 */
export function useLeaveGuard({ active, title, message, onLeave }: Options) {
  const navigation = useNavigation();
  const activeRef = useRef(active);
  activeRef.current = active;
  const leaveRef = useRef(onLeave);
  leaveRef.current = onLeave;
  const bypass = useRef(false);
  const [pending, setPending] = useState<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !active });
  }, [active, navigation]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!activeRef.current || bypass.current) return;
        e.preventDefault();
        setPending(e.data.action);
      }),
    [navigation],
  );

  // Web browser back resets the router without beforeRemove, so no dialog can stop it: the set is
  // still thrown away when the screen goes. Reload / tab close get the browser's own prompt.
  useEffect(
    () => () => {
      if (activeRef.current && !bypass.current) void leaveRef.current().catch(() => undefined);
    },
    [],
  );
  useEffect(() => {
    if (Platform.OS !== 'web' || !active || typeof window === 'undefined') return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [active]);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await leaveRef.current();
    } catch {
      // Best effort: the user still leaves; an unfinished set is dropped on the next start anyway.
    }
    bypass.current = true;
    setPending(null);
    setBusy(false);
    navigation.dispatch(pending);
  };

  const dialog = (
    <Modal transparent visible={!!pending} animationType="fade" onRequestClose={() => !busy && setPending(null)}>
      <Pressable style={styles.backdrop} onPress={() => !busy && setPending(null)}>
        {pending ? (
          <Animated.View entering={ZoomIn.duration(220).reduceMotion(ReduceMotion.System)} style={{ width: '100%', alignItems: 'center' }}>
            <Pressable style={styles.dialog}>
              <Text style={[titleFont(20), { color: colors.ink, textAlign: 'center' }]}>{title}</Text>
              <Muted style={{ textAlign: 'center' }}>{message}</Muted>
              <Button testID="leave-confirm" variant="danger" label="그만두고 나가기" loading={busy} onPress={confirm} />
              <Button variant="white" size="md" label="계속 풀기" disabled={busy} onPress={() => setPending(null)} />
            </Pressable>
          </Animated.View>
        ) : null}
      </Pressable>
    </Modal>
  );

  return {
    dialog,
    allow: () => {
      bypass.current = true;
    },
  };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(36,27,77,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 360, backgroundColor: colors.cream, borderRadius: radius.xl, padding: 22, gap: 10 },
});
