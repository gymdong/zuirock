import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { chosungBoxes } from '../lib/korean';
import { createImeSubmitGuard } from '../lib/imeGuard';
import { bodyFont, colors, radius, titleFont } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';

interface InputProps {
  onSubmit: (answer: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Answer input with the Korean IME guard (AC-M6): Enter or "제출" during composition is deferred
 * until `compositionend`, so a half-built syllable is never sent. Clears after each submission.
 */
export function ChosungInput({ onSubmit, disabled, placeholder = '생각나면 바로 입력' }: InputProps) {
  const [value, setValue] = useState('');
  const valueRef = useRef('');
  const inputRef = useRef<TextInput>(null);
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;

  const guard = useMemo(
    () =>
      createImeSubmitGuard((answer) => {
        submitRef.current(answer);
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

  return (
    <View style={styles.row}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => {
          valueRef.current = t;
          setValue(t);
        }}
        onSubmitEditing={submit}
        submitBehavior="submit"
        editable={!disabled}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="send"
        accessibilityLabel="정답 입력"
        style={[styles.input, bodyFont(19, '600'), disabled ? { opacity: 0.6 } : null]}
      />
      <Button label="제출" onPress={submit} disabled={disabled} style={styles.button} />
    </View>
  );
}

/** One box per syllable; locked until the chosung is revealed (p8). */
export function ChosungBoxes({ chosung, length }: { chosung?: string; length: number }) {
  const boxes = chosungBoxes(chosung, length);
  return (
    <View style={styles.boxes}>
      {boxes.map((c, i) => (
        <View key={i} style={[styles.box, c ? styles.boxOpen : null]}>
          {c ? <Text style={[titleFont(28), { color: colors.primary }]}>{c}</Text> : <Icon name="lock" size={24} color={colors.mouse} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  input: {
    flex: 1,
    minWidth: 0,
    height: 58,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.mouse,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    color: colors.ink,
  },
  button: { width: 96 },
  boxes: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  box: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.mouse,
    backgroundColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOpen: { borderStyle: 'solid', backgroundColor: colors.white },
});
