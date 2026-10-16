import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { errorMessage } from '../api/client';
import { Api } from '../api/endpoints';
import { useSession } from '../state/session';
import { bodyFont, colors, radius } from '../theme';
import { Button } from './Button';
import { Choice, ErrorText, Muted } from './ui';

const REASONS = ['정답이 틀렸어요', '문제가 이상해요', '해설·출처가 틀렸어요'];

/** "문제 신고" on explanation screens (AC-C6): a reason plus evidence (text or link) is required. */
export function ReportQuestion({ questionId }: { questionId: string }) {
  const member = useSession().member;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]!);
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!member) return null;
  if (done) return <Muted>신고했어요. 검토 후 반영할게요.</Muted>;
  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-end' }}>
        <Text style={[bodyFont(13, '700'), { color: colors.inkMuted, textDecorationLine: 'underline' }]}>문제 신고</Text>
      </Pressable>
    );
  }
  const text = evidence.trim();
  const isUrl = /^https?:\/\//i.test(text);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await Api.reportQuestion(questionId, { reason, ...(isUrl ? { evidenceUrl: text } : { evidenceText: text }) });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.box}>
      <View style={styles.reasons}>
        {REASONS.map((r) => (
          <Choice key={r} label={r} selected={reason === r} onPress={() => setReason(r)} style={styles.reason} textStyle={{ fontSize: 13 }} />
        ))}
      </View>
      <TextInput
        value={evidence}
        onChangeText={setEvidence}
        placeholder="근거를 적거나 링크를 붙여 주세요 (필수)"
        placeholderTextColor={colors.inkMuted}
        multiline
        accessibilityLabel="신고 근거"
        style={[styles.input, bodyFont(14)]}
      />
      <ErrorText>{error}</ErrorText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button size="sm" variant="white" label="취소" style={{ flex: 1 }} onPress={() => setOpen(false)} />
        <Button size="sm" label="신고하기" style={{ flex: 1 }} loading={busy} disabled={!text} onPress={submit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.cream },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reason: { height: 34, paddingHorizontal: 10 },
  input: { minHeight: 64, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white, padding: 10, color: colors.ink },
});
