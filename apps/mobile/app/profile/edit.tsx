import type { AvatarSource } from '@zuirock/shared';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { errorMessage } from '../../src/api/client';
import { Api } from '../../src/api/endpoints';
import { Avatar } from '../../src/components/Avatar';
import { Button } from '../../src/components/Button';
import { Screen } from '../../src/components/Screen';
import { ErrorText, Muted } from '../../src/components/ui';
import { session, useSession } from '../../src/state/session';
import { bodyFont, colors, radius, titleFont } from '../../src/theme';

const MAX = 10;
const REASON: Record<string, string> = { TOO_LONG: '10자까지 쓸 수 있어요', EMPTY: '닉네임을 입력해 주세요', TAKEN: '이미 쓰는 닉네임이에요' };

/** p14 프로필 편집: photo from social / album (≤ 1 MB upload) / character face; nickname check (AC-A4). */
export default function EditProfile() {
  const router = useRouter();
  const me = useSession().member!.user;
  const [source, setSource] = useState<AvatarSource>(me.avatar.source);
  const [assetKey, setAssetKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(me.avatar.source === 'upload' ? me.avatar.url : null);
  const [nickname, setNickname] = useState(me.nickname);
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const n = nickname.trim();
    if (n === me.nickname) return setCheck(null);
    const t = setTimeout(() => {
      Api.nicknameAvailable(n).then(
        (r) => setCheck(r.available ? { ok: true, text: '사용할 수 있는 닉네임이에요' } : { ok: false, text: REASON[r.reason ?? ''] ?? '쓸 수 없는 닉네임이에요' }),
        (e: unknown) => setCheck({ ok: false, text: errorMessage(e) }),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [nickname, me.nickname]);

  const pickPhoto = async () => {
    setError(null);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (r.canceled || !r.assets[0]) return;
    const asset = r.assets[0];
    setBusy(true);
    try {
      const form = new FormData();
      if (Platform.OS === 'web' && asset.file) form.append('file', asset.file);
      else form.append('file', { uri: asset.uri, name: asset.fileName ?? 'avatar.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
      const up = await Api.uploadAsset(form);
      setAssetKey(up.key);
      setPreview(up.url || asset.uri);
      setSource('upload');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const n = nickname.trim();
      const updated = await Api.updateProfile({
        nickname: n !== me.nickname ? n : undefined,
        avatarSource: source,
        avatarAssetKey: source === 'upload' ? (assetKey ?? undefined) : undefined,
      });
      await session.updateMe(updated);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const options: Array<[AvatarSource, string, () => void]> = [
    ['social', me.providers.includes('kakao') ? '카카오 프로필 사진 쓰기' : '소셜 프로필 사진 쓰기', () => setSource('social')],
    ['upload', '앨범에서 고르기', pickPhoto],
    ['character', '내 캐릭터 얼굴로', () => setSource('character')],
  ];
  const nickChanged = nickname.trim() !== me.nickname;
  const canSave = !busy && (!nickChanged || check?.ok === true) && !(source === 'upload' && !assetKey && me.avatar.source !== 'upload');

  return (
    <Screen title="프로필 편집" footer={<><ErrorText>{error}</ErrorText><Button label="저장" onPress={save} loading={busy} disabled={!canSave} /></>}>
      <Muted>프로필 사진은 다른 사람이 내 프로필을 볼 때 캐릭터와 함께 보여요</Muted>
      <Text style={[titleFont(18), { color: colors.ink }]}>프로필 사진</Text>
      <View style={{ alignItems: 'center' }}>
        <Avatar avatar={{ source, url: source === 'upload' ? preview : source === 'social' ? me.avatar.url : null }} size={110} />
      </View>
      {options.map(([s, label, onPress]) => (
        <Pressable key={s} onPress={onPress} style={[styles.option, source === s && styles.optionOn]} accessibilityRole="radio" accessibilityState={{ checked: source === s }}>
          <Text style={[bodyFont(16, '800'), { color: source === s ? colors.primary : colors.ink }]}>{label}</Text>
        </Pressable>
      ))}
      <View style={styles.nickHead}>
        <Text style={[titleFont(18), { color: colors.ink, flex: 1 }]}>닉네임</Text>
        <Muted>{[...nickname].length} / {MAX}</Muted>
      </View>
      <TextInput value={nickname} onChangeText={(t) => setNickname([...t].slice(0, MAX).join(''))} style={[styles.input, bodyFont(18, '700')]} accessibilityLabel="닉네임" maxLength={MAX} />
      {check ? <Text style={[bodyFont(14, '700'), { color: check.ok ? colors.mintText : colors.wrong }]}>{check.text}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { height: 54, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.lavender },
  nickHead: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  input: { height: 56, borderRadius: radius.lg, borderWidth: 3, borderColor: colors.mouse, backgroundColor: colors.white, paddingHorizontal: 16, color: colors.ink },
});
