import { TOPIC_NAME_BY_ID, type RoomSettings, type TopicId } from '@zuirock/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../src/api/client';
import { Api } from '../../src/api/endpoints';
import { Button } from '../../src/components/Button';
import { RoomSettingsForm, settingsValid } from '../../src/components/RoomSettingsForm';
import { Screen } from '../../src/components/Screen';
import { ErrorText, Muted } from '../../src/components/ui';
import { settingsSummary } from '../../src/lib/copy';
import { availableTopicIds, sanitizeTopicIds } from '../../src/lib/roomSettings';
import { useAsync } from '../../src/lib/useAsync';
import { roomStore } from '../../src/state/room';

/** p9 대결 방 만들기. */
export default function CreateRoom() {
  const router = useRouter();
  /** From a friend profile: that friend gets an in-app invite (AC-A7). */
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  const topics = useAsync(() => Api.topics(), []);
  const [s, setS] = useState<RoomSettings>({
    // Filled with every available topic once GET /topics resolves (never an unavailable id).
    topicIds: [],
    types: ['chosung', 'mcq'],
    questionCount: 20,
    // ★1 이상: a fresh deploy may have few questions; the lobby's shortage dialog covers the rest.
    minDifficulty: 1,
    maxDifficulty: 5,
    timeLimitSec: 60,
    chosungRevealSec: 45,
    avoidRecent: true,
    chat: true,
    firstLetterHint: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = availableTopicIds(topics.data ?? []);
  const availableKey = available.join(',');
  useEffect(() => {
    if (topics.data) setS((prev) => ({ ...prev, topicIds: sanitizeTopicIds(prev.topicIds, availableTopicIds(topics.data!)) }));
  }, [topics.data, availableKey]);
  const topicIds = s.topicIds.filter((id) => available.includes(id));
  const noTopics = !!topics.data && available.length === 0;
  const valid = settingsValid(s, topics.data);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { code } = await Api.createRoom({ settings: { ...s, topicIds }, inviteFriendIds: invite ? [invite] : undefined });
      await roomStore.enter(code);
      router.replace(`/room/${code}/lobby`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="대결 방 만들기"
      footer={
        <>
          {topicIds.length > 0 ? (
            <Muted style={{ textAlign: 'center' }}>{settingsSummary({ ...s, topicIds }, (id) => TOPIC_NAME_BY_ID[id as TopicId])}</Muted>
          ) : null}
          <ErrorText>
            {error ??
              topics.error ??
              (noTopics ? '아직 문제가 준비된 주제가 없어요. 문제가 공개되면 방을 만들 수 있어요.' : null)}
          </ErrorText>
          <Button label="방 만들고 초대하기" onPress={create} loading={busy} disabled={!valid} />
        </>
      }
    >
      <RoomSettingsForm s={s} onChange={setS} topics={topics.data} />
    </Screen>
  );
}
