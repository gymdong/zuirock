import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { connection, useConnection } from '../lib/connection';
import { colors, radius, titleFont } from '../theme';
import { Button } from './Button';
import { Mascot } from './Mascot';
import { Text } from './Text';
import { Muted } from './ui';

/** 서버에 연결하지 못했을 때 빨간 글씨 대신 뜨는 안내. 루트 레이아웃에 한 번만 둔다. */
export function ConnectionModal() {
  const { open } = useConnection();
  return (
    <Modal supportedOrientations={['portrait', 'landscape']} transparent visible={open} animationType="fade" onRequestClose={connection.dismiss}>
      <Pressable style={styles.backdrop} onPress={connection.dismiss}>
        {open ? (
          <Animated.View entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)} style={{ width: '100%', alignItems: 'center' }}>
            <Pressable style={styles.dialog}>
              <View style={{ alignItems: 'center' }}>
                <Mascot size={84} mood="surprised" finished />
              </View>
              <Text style={[titleFont(20), { color: colors.ink, textAlign: 'center' }]}>연결이 불안정해요</Text>
              <Muted style={{ textAlign: 'center' }}>
                서버가 깨어나는 중이거나 인터넷이 잠깐 끊겼을 수 있어요. 잠시 후 다시 시도해 주세요. 계속 안 되면 앱을 완전히 닫았다가 다시 열어 주세요.
              </Muted>
              <Button testID="connection-retry" label="다시 시도" onPress={connection.retry} />
              <Button variant="white" size="md" label="닫기" onPress={connection.dismiss} />
            </Pressable>
          </Animated.View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(36,27,77,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 360, backgroundColor: colors.cream, borderRadius: radius.xl, padding: 22, gap: 10 },
});
