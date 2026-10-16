import type { TopicId } from '@zuirock/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../../src/api/client';
import { Api } from '../../src/api/endpoints';
import { Button } from '../../src/components/Button';
import { Screen } from '../../src/components/Screen';
import { ErrorText, Muted } from '../../src/components/ui';
import { useAsync } from '../../src/lib/useAsync';
import { session, useSession } from '../../src/state/session';
import { bodyFont, colors, radius, titleFont } from '../../src/theme';

/** Minimal p4 주제 고르기 (pass 2 will restyle). Unavailable topics show '준비 중' (AC-S9). */
export default function SelectTopics() {
  const router = useRouter();
  const me = useSession().member?.user;
  const topics = useAsync(() => Api.topics(), []);
  const [picked, setPicked] = useState<TopicId[]>(me?.selectedTopicIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    try {
      await session.updateMe(await Api.setTopics(picked));
      router.replace('/home');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="주제 고르기" footer={<><ErrorText>{error}</ErrorText><Button label={`${picked.length}개 주제 저장`} onPress={save} loading={busy} disabled={picked.length === 0} /></>}>
      <Muted>고른 주제만 홈에 나오고, 주제마다 레벨이 따로 쌓여요. 언제든 다시 바꿀 수 있어요.</Muted>
      <ErrorText>{topics.error}</ErrorText>
      <View style={styles.grid}>
        {(topics.data ?? []).map((t) => {
          const on = picked.includes(t.id);
          return (
            <Pressable
              key={t.id}
              disabled={!t.available}
              onPress={() => setPicked(on ? picked.filter((x) => x !== t.id) : [...picked, t.id])}
              style={[styles.tile, on && styles.on, !t.available && { opacity: 0.45 }]}
            >
              <Text style={[titleFont(20), { color: on ? colors.white : colors.ink }]}>{t.name}</Text>
              <Text style={[bodyFont(13, '600'), { color: on ? colors.lavenderStrong : colors.inkSoft }]}>
                {t.available ? t.subtitle : '준비 중'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48%',
    flexGrow: 1,
    padding: 16,
    gap: 4,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  on: { backgroundColor: colors.primary, borderColor: colors.primary },
});
