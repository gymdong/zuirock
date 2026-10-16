import type { BattleResultRowDto } from '@zuirock/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../../../src/api/client';
import { Button } from '../../../src/components/Button';
import { Mascot } from '../../../src/components/Mascot';
import { Screen } from '../../../src/components/Screen';
import { Card, ErrorText, Muted } from '../../../src/components/ui';
import { battleXpCopy, wrongNoteCopy } from '../../../src/lib/copy';
import { roomStore, useRoom } from '../../../src/state/room';
import { bodyFont, colors, radius, titleFont } from '../../../src/theme';

const PODIUM = [
  { place: 2, height: 150, bg: colors.lavender },
  { place: 1, height: 200, bg: colors.cheese },
  { place: 3, height: 110, bg: colors.track },
] as const;

/** p11 결과: rank, score, correct count, account XP; guests get "최대 N XP" and the save button. */
export default function Result() {
  const router = useRouter();
  const room = useRoom();
  const [error, setError] = useState<string | null>(null);
  const snap = room.snapshot!;
  const results = room.finished?.results ?? snap.results ?? [];
  const you = room.finished?.you;
  const mine = results.find((r) => r.participantId === snap.you.participantId);
  const isGuest = mine?.kind === 'guest' || !!you?.canSaveByLogin;
  const total = snap.question?.total ?? snap.settings.questionCount;
  const byPlace = (n: number): BattleResultRowDto | undefined => [...results].sort((a, b) => a.rank - b.rank)[n - 1];
  const xp = you ? battleXpCopy(you.xp, isGuest) : null;
  const rankBonus = !isGuest && mine && mine.rank <= 3 ? ` · ${mine.rank}위 보너스` : '';

  return (
    <Screen
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          {isGuest ? (
            <Button
              variant="kakao"
              label="로그인하고 기록 저장하기"
              onPress={() => router.push({ pathname: '/login', params: { next: '/home' } })}
            />
          ) : null}
          <Button
            label="한 판 더"
            onPress={() => roomStore.rematch().catch((e: unknown) => setError(errorMessage(e)))}
          />
          {!isGuest ? <Button variant="white" label="오답과 해설 보기" onPress={() => router.push('/profile/wrong-notes')} /> : null}
        </>
      }
    >
      <Text style={[titleFont(36, '900'), styles.title]}>대결 끝!</Text>
      <View style={styles.podium}>
        {PODIUM.map(({ place, height, bg }) => {
          const r = byPlace(place);
          if (!r) return <View key={place} style={{ flex: 1 }} />;
          return (
            <View key={place} style={styles.col}>
              <Mascot size={place === 1 ? 104 : 80} mood={place === 1 ? 'happy' : r.kind === 'guest' ? 'smile' : 'glasses'} gray={r.kind === 'guest'} crown={place === 1} />
              <Text style={[bodyFont(15, '800'), { color: colors.ink }]} numberOfLines={1}>
                {r.nickname}
                {r.participantId === snap.you.participantId ? ' (나)' : ''}
              </Text>
              <View style={[styles.block, { height, backgroundColor: bg }, place === 1 && styles.first]}>
                <Text style={[titleFont(34), { color: colors.ink }]}>{r.rank}</Text>
                <Text style={[titleFont(17), { color: colors.ink }]}>{r.score}점</Text>
              </View>
            </View>
          );
        })}
      </View>
      {results.length > 3 ? (
        <Muted style={{ textAlign: 'center' }}>
          {results.slice(3).map((r) => `${r.rank}위 ${r.nickname} ${r.score}점`).join(' · ')}
        </Muted>
      ) : null}

      <Card style={styles.stats}>
        <View style={styles.stat}>
          <Text style={[titleFont(30), { color: colors.ink }]}>
            {mine?.correctCount ?? 0}/{total}
          </Text>
          <Muted>정답</Muted>
        </View>
        <View style={styles.stat}>
          <Text style={[titleFont(isGuest ? 20 : 30), { color: colors.primary, textAlign: 'center' }]}>{xp?.value ?? '…'}</Text>
          <Muted style={{ textAlign: 'center' }}>{xp ? `${xp.caption}${rankBonus}` : ''}</Muted>
        </View>
        <View style={styles.stat}>
          <Text style={[titleFont(30), { color: colors.cheeseText }]}>{mine ? `${mine.rank}위` : '-'}</Text>
          <Muted>순위</Muted>
        </View>
      </Card>

      <View style={styles.note}>
        <Text style={[bodyFont(16, '700'), { color: colors.primaryDark, lineHeight: 24 }]}>
          {isGuest ? '로그인하면 이번 대결 기록과 XP가 내 계정에 저장되고, 틀린 문제는 오답노트에 담겨요.' : wrongNoteCopy(you?.wrongNotesAdded ?? 0)}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, textAlign: 'center', marginTop: 8 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  block: { alignSelf: 'stretch', borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  first: { borderBottomWidth: 6, borderBottomColor: colors.cheeseDark },
  stats: { flexDirection: 'row', paddingVertical: 20 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  note: { backgroundColor: colors.lavender, borderRadius: radius.lg, padding: 18 },
});
