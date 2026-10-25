import type { FriendSummaryDto, UserSearchResultDto } from '@zuirock/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { errorMessage } from '../../src/api/client';
import { Api } from '../../src/api/endpoints';
import { Avatar } from '../../src/components/Avatar';
import { Button } from '../../src/components/Button';
import { Rise } from '../../src/components/motion';
import { Screen } from '../../src/components/Screen';
import { ErrorText, Muted, SectionTitle, Tag } from '../../src/components/ui';
import { useAsync } from '../../src/lib/useAsync';
import { bodyFont, colors, radius, titleFont } from '../../src/theme';

function Row({ user, onPress, right }: { user: FriendSummaryDto; onPress?: () => void; right?: React.ReactNode }) {
  const body = (
    <>
      <Avatar avatar={user.avatar} size={52} />
      <View style={{ flex: 1 }}>
        <Text style={[titleFont(18), { color: colors.ink }]}>{user.nickname}</Text>
        <Muted>Lv.{user.level}</Muted>
      </View>
      {right}
    </>
  );
  return (
    <Rise i={0}>
      {onPress ? (
        <Pressable style={styles.row} onPress={onPress}>
          {body}
        </Pressable>
      ) : (
        <View style={styles.row}>{body}</View>
      )}
    </Rise>
  );
}

/** 친구 목록 + 닉네임 검색·신청·수락 (AC-A5). */
export default function Friends() {
  const router = useRouter();
  const list = useAsync(() => Api.friends(), []);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<UserSearchResultDto['users'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      list.reload();
      if (query.trim()) setFound((await Api.searchUsers(query.trim())).users);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const search = () => query.trim() && act(async () => undefined);
  const friends = list.data?.friends ?? [];
  const incoming = list.data?.incoming ?? [];
  const outgoing = list.data?.outgoing ?? [];

  return (
    <Screen title={`친구 ${friends.length}명`}>
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          placeholder="닉네임으로 친구 찾기"
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel="닉네임 검색"
          style={[styles.input, bodyFont(16, '600')]}
        />
        <Button size="md" label="찾기" onPress={search} style={{ width: 80 }} />
      </View>
      <ErrorText>{error ?? list.error}</ErrorText>
      {found ? (
        found.length === 0 ? (
          <Muted>찾는 닉네임이 없어요.</Muted>
        ) : (
          found.map((u) => (
            <Row
              key={u.userId}
              user={u}
              right={
                u.friendship === 'accepted' ? (
                  <Tag label="친구" bg={colors.mintSoft} color={colors.mintText} />
                ) : u.friendship === 'pending' ? (
                  <Tag label="신청됨" bg={colors.track} color={colors.inkSoft} />
                ) : (
                  <Button size="sm" label="친구 신청" style={{ width: 96 }} onPress={() => act(() => Api.requestFriend(u.userId))} />
                )
              }
            />
          ))
        )
      ) : null}

      {incoming.length > 0 ? <SectionTitle>받은 친구 신청</SectionTitle> : null}
      {incoming.map((r) => (
        <Row key={r.requestId} user={r.user} right={<Button size="sm" label="수락" style={{ width: 72 }} onPress={() => act(() => Api.acceptFriend(r.user.userId))} />} />
      ))}
      {outgoing.length > 0 ? <SectionTitle>보낸 신청</SectionTitle> : null}
      {outgoing.map((r) => (
        <Row key={r.requestId} user={r.user} right={<Tag label="대기 중" bg={colors.track} color={colors.inkSoft} />} />
      ))}

      <SectionTitle>친구</SectionTitle>
      {!list.loading && friends.length === 0 ? <Muted>아직 친구가 없어요. 대결한 친구를 닉네임으로 찾아 신청해 보세요.</Muted> : null}
      {friends.map((f) => (
        <Row key={f.userId} user={f} onPress={() => router.push(`/friends/${f.userId}`)} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 2, borderBottomWidth: 5, borderColor: colors.border },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  input: { flex: 1, minWidth: 0, height: 48, borderRadius: radius.md, borderWidth: 2, borderColor: colors.mouse, backgroundColor: colors.white, paddingHorizontal: 14, color: colors.ink },
});
