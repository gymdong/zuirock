import { Pressable, StyleSheet, Text, View } from 'react-native';
import { sound, useAudioSettings } from '../../src/audio';
import { Screen } from '../../src/components/Screen';
import { Slider } from '../../src/components/Slider';
import { Card, Muted, SectionTitle } from '../../src/components/ui';
import { bodyFont, colors, radius, titleFont } from '../../src/theme';

function Toggle({ label, desc, value, onChange, testID }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void; testID: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[bodyFont(17, '800'), { color: colors.ink }]}>{label}</Text>
        <Muted style={{ fontSize: 13 }}>{desc}</Muted>
      </View>
      <View style={[styles.track, { backgroundColor: value ? colors.correct : colors.track }]}>
        <View style={[styles.knob, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
      </View>
    </Pressable>
  );
}

/** 설정 (item 9/10): sound effects, lobby music and volume, saved on this device. */
export default function Settings() {
  const s = useAudioSettings();
  return (
    <Screen title="설정">
      <SectionTitle>소리</SectionTitle>
      <Toggle
        testID="toggle-sfx"
        label="효과음"
        desc="버튼, 정답·오답, 상자 열기 소리"
        value={s.sfxOn}
        onChange={(v) => {
          sound.update({ sfxOn: v });
          if (v) sound.play('tap');
        }}
      />
      <Toggle testID="toggle-bgm" label="배경음악" desc="홈과 대기실에서 잔잔하게 (대결 중에는 꺼져요)" value={s.bgmOn} onChange={(v) => sound.update({ bgmOn: v })} />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[bodyFont(17, '800'), { color: colors.ink, flex: 1 }]}>볼륨</Text>
          <Text style={[titleFont(18), { color: colors.primary }]}>{Math.round(s.volume * 100)}%</Text>
        </View>
        <Slider
          accessibilityLabel="볼륨"
          value={Math.round(s.volume * 10)}
          min={0}
          max={10}
          step={1}
          onChange={(v) => sound.update({ volume: v / 10 })}
        />
      </Card>
      <Muted style={{ fontSize: 12 }}>효과음과 배경음악은 쥐락펴락이 직접 만든 소리예요.</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 18, borderWidth: 2, borderBottomWidth: 5, borderColor: colors.border, padding: 18 },
  track: { width: 52, height: 30, borderRadius: radius.pill, padding: 3, justifyContent: 'center' },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white },
});
