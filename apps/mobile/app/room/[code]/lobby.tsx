import { DEFAULT_CONFIG } from '@zuirock/game-rules';
import { TOPIC_NAME_BY_ID } from '@zuirock/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { errorMessage } from '../../../src/api/client';
import { useLobbyBgm } from '../../../src/audio';
import { Button } from '../../../src/components/Button';
import { Icon } from '../../../src/components/Icon';
import { Mascot } from '../../../src/components/Mascot';
import { Bob, Pop, Pulse, Twinkle } from '../../../src/components/motion';
import { Screen } from '../../../src/components/Screen';
import { Card, ErrorText, Muted, Tag } from '../../../src/components/ui';
import { inviteUrl } from '../../../src/lib/config';
import { timeLimitLabel, TYPE_LABEL } from '../../../src/lib/copy';
import { shareLink } from '../../../src/lib/share';
import { roomStore, useRoom } from '../../../src/state/room';
import { session } from '../../../src/state/session';
import { bodyFont, colors, radius, titleFont } from '../../../src/theme';

/** p10 대기실. */
export default function Lobby() {
  useLobbyBgm();
  const router = useRouter();
  const room = useRoom();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortage, setShortage] = useState<{ available: number; requested: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const snap = room.snapshot!;
  const me = snap.participants.find((p) => p.participantId === snap.you.participantId);
  const isHost = snap.hostParticipantId === snap.you.participantId;
  const others = snap.participants.filter((p) => p.participantId !== snap.hostParticipantId);
  const canStart = snap.participants.length >= DEFAULT_CONFIG.room.minPlayers && others.every((p) => p.ready);
  const s = snap.settings;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(room.error);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const start = (accept?: number) =>
    run(async () => {
      const r = await roomStore.start(accept);
      setShortage(r.status === 'shortage' ? { available: r.available, requested: r.requested } : null);
    });

  const leave = async () => {
    await roomStore.leave();
    router.dismissTo(session.get().member ? '/home' : `/join/${snap.code}`);
  };

  return (
    <Screen
      title="대기실"
      back={leave}
      footer={
        <>
          {shortage ? (
            <Card style={{ gap: 10 }}>
              <Text style={[bodyFont(16, '700'), { color: colors.ink }]}>
                조건에 맞는 문제가 {shortage.available}개뿐이에요. {shortage.available}문제로 진행할까요?
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button size="md" variant="white" label="취소" style={{ flex: 1 }} onPress={() => setShortage(null)} />
                <Button size="md" label={`${shortage.available}문제로 시작`} style={{ flex: 1 }} onPress={() => start(shortage.available)} />
              </View>
            </Card>
          ) : null}
          <ErrorText>{error ?? room.error}</ErrorText>
          {isHost ? (
            <Button label="대결 시작" onPress={() => start()} loading={busy} disabled={!canStart} />
          ) : (
            <Button
              label={me?.ready ? '준비 취소' : '준비 완료'}
              variant={me?.ready ? 'white' : 'primary'}
              loading={busy}
              onPress={() => run(async () => { await roomStore.ready(!me?.ready); })}
            />
          )}
          {isHost && !canStart ? (
            <Muted style={{ textAlign: 'center' }}>2명 이상 모이고 모두 준비 완료하면 시작할 수 있어요</Muted>
          ) : null}
        </>
      }
    >
      <View style={styles.codeCard}>
        <Twinkle style={{ top: 16, right: 150 }} size={6} />
        <Twinkle style={{ top: 70, right: 24 }} size={5} delay={600} />
        <Twinkle style={{ bottom: 22, right: 110 }} size={7} delay={1100} color={colors.cheese} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={[bodyFont(15, '700'), { color: colors.lavenderStrong }]}>방 코드</Text>
            <Text style={[titleFont(54, '900'), { color: colors.white, letterSpacing: 10 }]}>{snap.code}</Text>
          </View>
          <Button
            variant="cheese"
            size="md"
            label={copied ? '복사했어요' : '링크 공유'}
            left={<Icon name="link" size={20} color={colors.ink} />}
            onPress={async () => {
              const r = await shareLink(inviteUrl(snap.code), '쥐락펴락 대결에 초대해요! 링크를 누르고 닉네임만 입력하면 바로 들어와요.');
              setCopied(r === 'copied');
            }}
          />
        </View>
        <Text style={[bodyFont(15), { color: colors.lavenderStrong, lineHeight: 22 }]}>
          링크를 받은 친구는 앱 없이 닉네임만 입력하고 바로 들어와요
        </Text>
      </View>

      <View style={styles.tags}>
        <Tag label={s.topicIds.map((t) => TOPIC_NAME_BY_ID[t]).join(' · ')} />
        <Tag label={s.types.map((t) => TYPE_LABEL[t]).join(' · ')} />
        <Tag label={`난이도 ★${s.minDifficulty} 이상`} />
        <Tag label={`${s.questionCount}문제`} />
        <Tag
          label={`문제당 ${timeLimitLabel(s.timeLimitSec)}${s.types.includes('chosung') && s.chosungRevealSec != null ? ` · 남은 ${s.chosungRevealSec}초에 초성 공개` : ''}`}
        />
      </View>

      <Text style={[titleFont(20), { color: colors.ink }]}>
        참가자 {snap.participants.length} / {DEFAULT_CONFIG.room.maxPlayers}
      </Text>
      {snap.participants.map((p, idx) => {
        const host = p.participantId === snap.hostParticipantId;
        const mine = p.participantId === snap.you.participantId;
        return (
          <Animated.View
            key={p.participantId}
            entering={FadeInDown.delay(Math.min(idx, 5) * 70).duration(300).reduceMotion(ReduceMotion.System)}
            style={[styles.person, !p.connected && { opacity: 0.5 }]}
          >
            <Bob distance={3}>
              <Mascot size={56} gray={p.kind === 'guest'} mood={host ? 'smile' : p.kind === 'guest' ? 'smile' : 'glasses'} crown={host} />
            </Bob>
            <View style={{ flex: 1 }}>
              <Text style={[titleFont(19), { color: colors.ink }]}>{p.nickname}</Text>
              <Muted>
                {p.kind === 'guest' ? '게스트 · 링크로 입장' : '회원'}
                {mine ? ' · 나' : ''}
                {!p.connected ? ' · 연결 끊김' : ''}
              </Muted>
            </View>
            {host ? (
              <Tag label="방장" bg={colors.cheeseSoft} color={colors.cheeseText} />
            ) : p.ready ? (
              <Pop trigger={String(p.ready)}>
                <Tag label="준비 완료" bg={colors.mintSoft} color={colors.mintText} />
              </Pop>
            ) : (
              <Tag label="대기 중" bg={colors.track} color={colors.inkSoft} />
            )}
          </Animated.View>
        );
      })}
      {snap.participants.length < DEFAULT_CONFIG.room.maxPlayers ? (
        <Pulse active>
          <View style={styles.waiting}>
            <Icon name="plus" size={20} color={colors.inkSoft} />
            <Text style={[bodyFont(16, '700'), { color: colors.inkSoft }]}>친구를 기다리는 중</Text>
          </View>
        </Pulse>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    borderBottomWidth: 6,
    borderBottomColor: colors.primaryDark,
    padding: 22,
    gap: 8,
    overflow: 'hidden',
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 14,
  },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 72,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.lavenderStrong,
  },
});
