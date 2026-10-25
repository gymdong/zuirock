import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { bodyFont, colors, radius } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';

/** "방 만들기 / 코드로 참가" pair (p3, p5, 대결 탭). The code field opens inline. */
export function BattleActions() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const valid = /^\d{4}$/.test(code);
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.row}>
        <Button
          variant="white"
          label="방 만들기"
          left={<Icon name="plus" size={22} color={colors.primary} />}
          onPress={() => router.push('/battle/create')}
          style={styles.half}
        />
        <Button
          variant="white"
          label="코드로 참가"
          left={<Icon name="code" size={22} color={colors.primary} />}
          onPress={() => setOpen((o) => !o)}
          style={styles.half}
        />
      </View>
      {open ? (
        <View style={styles.codeRow}>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            placeholder="방 코드 4자리"
            placeholderTextColor={colors.inkMuted}
            maxLength={4}
            autoFocus
            onSubmitEditing={() => valid && router.push(`/join/${code}`)}
            style={[styles.input, bodyFont(20, '800')]}
            accessibilityLabel="방 코드"
          />
          <Pressable
            accessibilityRole="button"
            disabled={!valid}
            onPress={() => router.push(`/join/${code}`)}
            style={[styles.go, !valid && { opacity: 0.4 }]}
          >
            <Text style={[bodyFont(16, '800'), { color: colors.white }]}>참가</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  codeRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.mouse,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    color: colors.ink,
    letterSpacing: 6,
  },
  go: { width: 80, borderRadius: radius.md, backgroundColor: colors.primary, borderBottomWidth: 4, borderBottomColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
});
