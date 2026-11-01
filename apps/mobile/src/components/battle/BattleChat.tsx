import { CHAT_MAX_LENGTH, STICKER_IDS, type ChatAck } from '@zuirock/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { MAX_FONT_SCALE, Text } from '../Text';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { createImeSubmitGuard } from '../../lib/imeGuard';
import { emit } from '../../lib/events';
import { roomStore, useRoom, type ChatLine } from '../../state/room';
import { bodyFont, colors, radius } from '../../theme';
import { Button } from '../Button';
import { Mascot } from '../Mascot';
import { Sticker } from './Sticker';

interface Props {
  /** How many recent lines to show above the input. */
  lines?: number;
  placeholder?: string;
  /** Answer mode (chosung): the ack of every line, so the screen can show the verdict. */
  onAck?: (ack: ChatAck) => void;
  disabled?: boolean;
  /** Label of the send button (제출 in answer mode). */
  sendLabel?: string;
}

/**
 * 대결 채팅 (10/26): recent lines + input + mascot sticker tray. In answer mode the same box is the
 * chosung answer box: wrong attempts come back as everyone's chat lines, near-misses only for me.
 */
export function BattleChat({ lines = 4, placeholder = '채팅 입력', onAck, disabled, sendLabel = '보내기' }: Props) {
  const room = useRoom();
  const me = room.snapshot?.you.participantId;
  const [value, setValue] = useState('');
  const [tray, setTray] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const valueRef = useRef('');
  const inputRef = useRef<TextInput>(null);
  const ackRef = useRef(onAck);
  ackRef.current = onAck;

  const send = async (text: string) => {
    if (!text.trim()) return;
    setNotice(null);
    try {
      const ack = await roomStore.chat(text);
      ackRef.current?.(ack);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '보내지 못했어요');
    }
  };
  const guard = useMemo(
    () =>
      createImeSubmitGuard((text) => {
        void send(text);
        valueRef.current = '';
        setValue('');
      }),
    [],
  );
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = inputRef.current as unknown as HTMLInputElement | null;
    if (!node?.addEventListener) return;
    const start = () => guard.compositionStart();
    const end = () => guard.compositionEnd(node.value);
    node.addEventListener('compositionstart', start);
    node.addEventListener('compositionend', end);
    return () => {
      node.removeEventListener('compositionstart', start);
      node.removeEventListener('compositionend', end);
    };
  }, [guard]);
  const submit = () => {
    if (!disabled) guard.requestSubmit(valueRef.current);
  };

  const recent = room.chat.slice(-lines);
  return (
    <View style={{ gap: 8 }}>
      {recent.length > 0 ? (
        <View style={styles.log}>
          {recent.map((l) => (
            <Animated.View key={l.id} entering={FadeInDown.duration(200).reduceMotion(ReduceMotion.System)}>
              <Line line={l} mine={l.participantId === me} />
            </Animated.View>
          ))}
        </View>
      ) : null}
      {notice ? <Text style={[bodyFont(13, '700'), { color: colors.wrong }]}>{notice}</Text> : null}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="스티커"
          onPress={() => {
            emit('tap');
            // 키보드가 올라와 있으면 먼저 내린다(가운데 뜨는 스티커 창이 키보드에 가려지지 않게)
            Keyboard.dismiss();
            setTray((t) => !t);
          }}
          style={[styles.stickerBtn, tray && styles.stickerBtnOn]}
        >
          <Mascot size={30} mood="happy" blink={false} />
        </Pressable>
        <TextInput
        maxFontSizeMultiplier={MAX_FONT_SCALE}
          ref={inputRef}
          value={value}
          onChangeText={(t) => {
            const v = t.slice(0, CHAT_MAX_LENGTH);
            valueRef.current = v;
            setValue(v);
          }}
          onSubmitEditing={submit}
          submitBehavior="submit"
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor={colors.inkMuted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="send"
          maxLength={CHAT_MAX_LENGTH}
          accessibilityLabel={onAck ? '정답 입력' : '채팅 입력'}
          style={[styles.input, bodyFont(17, '600'), disabled ? { opacity: 0.6 } : null]}
        />
        <Button label={sendLabel} size="md" onPress={submit} disabled={disabled} style={{ width: 84 }} />
      </View>
      {/* 스티커는 입력줄 아래로 펼치지 않고 모달로 잠깐 띄운다(키보드에 가려지지 않게) */}
      <Modal visible={tray} transparent animationType="fade" onRequestClose={() => setTray(false)} statusBarTranslucent>
        <Pressable style={styles.sheetBackdrop} onPress={() => setTray(false)} accessibilityLabel="닫기">
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={[bodyFont(16, '800'), { color: colors.ink, textAlign: 'center' }]}>스티커 보내기</Text>
            <View style={styles.sheetGrid}>
              {STICKER_IDS.map((id) => (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={`스티커 ${id}`}
                  onPress={() => {
                    emit('tap');
                    setTray(false);
                    roomStore.sticker(id).catch((e: unknown) => setNotice(e instanceof Error ? e.message : '보내지 못했어요'));
                  }}
                  style={styles.sheetItem}
                >
                  <Sticker id={id} size={56} />
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Line({ line, mine }: { line: ChatLine; mine: boolean }) {
  if (line.kind === 'correct') {
    return (
      <Text style={[bodyFont(14, '800'), styles.system, { color: colors.mintText, backgroundColor: colors.mintSoft }]}>
        🎉 {mine ? '내가' : `${line.nickname}님이`} 맞혔어요!
      </Text>
    );
  }
  if (line.kind === 'near') {
    return (
      <Text style={[bodyFont(14, '800'), styles.system, { color: colors.cheeseText, backgroundColor: colors.cheeseSoft }]}>
        “{line.text}” 거의 비슷해요! (나만 보여요)
      </Text>
    );
  }
  const wrong = line.kind === 'wrong';
  return (
    <View style={[styles.bubble, mine && styles.bubbleMine]}>
      <Text style={[bodyFont(13, '800'), { color: mine ? colors.lavenderStrong : colors.primary }]} numberOfLines={1}>
        {mine ? '나' : line.nickname}
      </Text>
      <Text style={[bodyFont(15, '700'), { color: mine ? colors.white : colors.ink, flexShrink: 1 }]}>
        {line.text}
        {wrong ? <Text style={{ color: mine ? colors.cheese : colors.wrong }}> ✗</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  log: { gap: 4 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    minWidth: 0,
    height: 52,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.mouse,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    color: colors.ink,
  },
  stickerBtn: {
    width: 48,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerBtnOn: { borderColor: colors.primary, borderBottomColor: colors.primaryDark, backgroundColor: colors.lavender },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(36,27,77,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 360, backgroundColor: colors.cream, borderRadius: radius.xl, padding: 18, gap: 12 },
  sheetGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 10 },
  sheetItem: { alignItems: 'center', width: '33.3%', paddingVertical: 6 },
  bubble: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '92%',
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 2,
    borderBottomWidth: 3,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderColor: colors.primary, borderBottomColor: colors.primaryDark },
  system: { alignSelf: 'center', borderRadius: 12, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4 },
});
