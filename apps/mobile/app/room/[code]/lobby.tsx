import { DEFAULT_CONFIG, firstLetterElapsedSec } from '@zuirock/game-rules';
import { TOPIC_NAME_BY_ID, type MultiRecordDto, type RoomSettings } from '@zuirock/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../../../src/components/Text';
import Animated, { FadeIn, FadeInDown, FadeOut, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { errorMessage } from '../../../src/api/client';
import { Api } from '../../../src/api/endpoints';
import { useLobbyBgm } from '../../../src/audio';
import { BattleChat } from '../../../src/components/battle/BattleChat';
import { StickerBurst } from '../../../src/components/battle/StickerBurst';
import { Button } from '../../../src/components/Button';
import { Icon } from '../../../src/components/Icon';
import { Mascot } from '../../../src/components/Mascot';
import { QrCode } from '../../../src/components/QrCode';
import { RoomSettingsForm, settingsValid } from '../../../src/components/RoomSettingsForm';
import { Bob, Breathe, Pop, Twinkle } from '../../../src/components/motion';
import { Screen } from '../../../src/components/Screen';
import { CheeseCap } from '../../../src/components/theme/Drip';
import { Card, ErrorText, Muted, Tag } from '../../../src/components/ui';
import { inviteUrl } from '../../../src/lib/config';
import { timeLimitLabel, TYPE_LABEL } from '../../../src/lib/copy';
import { bestTopicLine, recordLine } from '../../../src/lib/records';
import { availableTopicIds, sanitizeTopicIds } from '../../../src/lib/roomSettings';
import { useAsync } from '../../../src/lib/useAsync';
import { shareLink } from '../../../src/lib/share';
import { roomStore, useRoom } from '../../../src/state/room';
import { session } from '../../../src/state/session';
import { bodyFont, colors, radius, titleFont } from '../../../src/theme';

/** 방장이 대기실에서 방 설정을 바꾸는 화면. 저장하면 방 전원의 대기실 태그가 바로 바뀐다. */
function SettingsEditor({ current, onClose }: { current: RoomSettings; onClose: () => void }) {
  const topics = useAsync(() => Api.topics(), []);
  const [draft, setDraft] = useState<RoomSettings>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = settingsValid(draft, topics.data);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const topicIds = sanitizeTopicIds(draft.topicIds, availableTopicIds(topics.data ?? []));
      await roomStore.updateSettings({ ...draft, topicIds });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      title="방 설정 변경"
      back={onClose}
      footer={
        <>
          <ErrorText>{error ?? topics.error}</ErrorText>
          <Button label="설정 저장" onPress={save} loading={busy} disabled={!valid} />
        </>
      }
    >
      <RoomSettingsForm s={draft} onChange={setDraft} topics={topics.data} />
    </Screen>
  );
}

/** 현장 시연용: 방장 폰에 큼직한 입장 QR을 띄운다. 방문자는 폰 카메라로 찍고 닉네임만 입력하면 들어온다. */
function QrOverlay({ code, onClose }: { code: string; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const size = Math.min(width - 72, height * 0.5, 360);
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={styles.qrScrim}>
      <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View pointerEvents="box-none" style={styles.qrCenter}>
        <Text style={[titleFont(26, '900'), { color: colors.white, textAlign: 'center' }]}>QR로 바로 입장!</Text>
        <Animated.View entering={ZoomIn.springify().damping(12).reduceMotion(ReduceMotion.System)} style={styles.qrCard}>
          <QrCode value={inviteUrl(code)} size={size} />
        </Animated.View>
        <Text style={[bodyFont(16, '700'), { color: colors.lavenderStrong, textAlign: 'center' }]}>폰 카메라로 찍고 닉네임만 입력하세요</Text>
        <Text style={[titleFont(44, '900'), { color: colors.cheese, letterSpacing: 8 }]}>{code}</Text>
        <Button variant="cheese" size="md" label="닫기" onPress={onClose} style={{ minWidth: 160 }} />
      </View>
    </Animated.View>
  );
}

/** p10 대기실. */
export default function Lobby() {
  useLobbyBgm();
  const router = useRouter();
  const room = useRoom();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortage, setShortage] = useState<{ available: number; requested: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const snap = room.snapshot!;
  // 대기실 참가자 전적(회원만): 참가자가 바뀔 때마다 다시 읽는다. 게스트 화면이면 조용히 건너뛴다
  const [records, setRecords] = useState<Record<string, MultiRecordDto>>({});
  const seatKey = snap.participants.map((p) => p.participantId).join(',');
  useEffect(() => {
    if (!session.get().member) return;
    Api.roomRecords(snap.code).then((r) => setRecords(r.records), () => undefined);
  }, [seatKey, snap.code]);
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

  if (editing && isHost) return <SettingsEditor current={s} onClose={() => setEditing(false)} />;

  return (
    <Screen
      title="대기실"
      back={leave}
      overlay={qrOpen ? <QrOverlay code={snap.code} onClose={() => setQrOpen(false)} /> : null}
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
        <CheeseCap radius={28} />
        <Twinkle style={{ top: 16, right: 150 }} size={6} />
        <Twinkle style={{ top: 70, right: 24 }} size={5} delay={600} />
        <Twinkle style={{ bottom: 22, right: 110 }} size={7} delay={1100} color={colors.cheese} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <View>
            <Text style={[bodyFont(15, '700'), { color: colors.lavenderStrong }]}>방 코드</Text>
            <Text numberOfLines={1} style={[titleFont(54, '900'), { color: colors.white, letterSpacing: 8 }]}>{snap.code}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button variant="white" size="md" label="QR" left={<Icon name="code" size={20} color={colors.ink} />} onPress={() => setQrOpen(true)} />
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
        </View>
        <Text style={[bodyFont(15), { color: colors.lavenderStrong, lineHeight: 22 }]}>
          링크를 받은 친구는 앱 없이 닉네임만 입력하고 바로 들어와요
        </Text>
      </View>

      <View style={styles.tags}>
        <Tag label={s.topicIds.map((t) => TOPIC_NAME_BY_ID[t]).join(' · ')} />
        <Tag label={s.types.map((t) => TYPE_LABEL[t]).join(' · ')} />
        <Tag label={(s.maxDifficulty ?? 5) >= 5 ? `난이도 ★${s.minDifficulty} 이상` : s.minDifficulty === s.maxDifficulty ? `난이도 ★${s.minDifficulty}` : `난이도 ★${s.minDifficulty}~★${s.maxDifficulty}`} />
        <Tag label={`${s.questionCount}문제`} />
        {s.firstLetterHint && s.types.includes('chosung') && firstLetterElapsedSec(s) !== null ? <Tag label="첫 글자 힌트" bg={colors.cheeseSoft} color={colors.cheeseText} /> : null}
        {s.chat === false ? <Tag label="채팅 끔" bg={colors.track} color={colors.inkSoft} /> : null}
        {s.avoidRecent !== false ? <Tag label="최근 푼 문제 덜 나옴" bg={colors.cheeseSoft} color={colors.cheeseText} /> : null}
        <Tag
          label={`문제당 ${timeLimitLabel(s.timeLimitSec)}${s.types.includes('chosung') && s.chosungRevealSec != null ? ` · 남은 ${s.chosungRevealSec}초에 초성 공개` : ''}`}
        />
      </View>

      {isHost ? <Button variant="white" size="sm" label="방 설정 변경" onPress={() => setEditing(true)} style={{ alignSelf: 'flex-start' }} /> : null}

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
              <Mascot size={56} finished gray={p.kind === 'guest'} mood={host ? 'smile' : p.kind === 'guest' ? 'smile' : 'glasses'} crown={host} />
            </Bob>
            <View style={{ flex: 1 }}>
              <Text style={[titleFont(19), { color: colors.ink }]}>{p.nickname}</Text>
              <Muted>
                {p.kind === 'guest' ? '게스트 · 링크로 입장' : '회원'}
                {mine ? ' · 나' : ''}
                {!p.connected ? ' · 연결 끊김' : ''}
              </Muted>
              {records[p.participantId] ? (
                <>
                  <Muted style={{ fontSize: 13 }}>{recordLine(records[p.participantId]!)}</Muted>
                  {bestTopicLine(records[p.participantId]!) ? <Muted style={{ fontSize: 13 }}>{bestTopicLine(records[p.participantId]!)}</Muted> : null}
                </>
              ) : null}
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
        <Breathe>
          <View style={styles.waiting}>
            <Icon name="plus" size={20} color={colors.inkSoft} />
            <Text style={[bodyFont(16, '700'), { color: colors.inkSoft }]}>친구를 기다리는 중</Text>
          </View>
        </Breathe>
      ) : null}
      {s.chat !== false ? (
        <>
          <Text style={[titleFont(20), { color: colors.ink }]}>채팅</Text>
          <BattleChat lines={6} placeholder="인사해 보세요" />
          <StickerBurst />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  qrScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#2A1F66', zIndex: 110 },
  qrCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  qrCard: { backgroundColor: colors.white, borderRadius: radius.xl, padding: 14, borderBottomWidth: 6, borderBottomColor: colors.cheeseDark },
  codeCard: {
    paddingTop: 30,
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
    borderWidth: 2, borderBottomWidth: 5,
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
