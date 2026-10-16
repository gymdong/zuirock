import { StyleSheet, Text, View } from 'react-native';
import { BattleActions } from '../../../src/components/BattleActions';
import { Mascot } from '../../../src/components/Mascot';
import { Screen } from '../../../src/components/Screen';
import { Card, Muted } from '../../../src/components/ui';
import { colors, titleFont } from '../../../src/theme';

/** 대결 탭: create a room or join one by code. */
export default function BattleTab() {
  return (
    <Screen title="친구와 대결" back={false} edges={['top']}>
      <Card style={styles.card}>
        <Mascot size={120} mood="happy" />
        <Text style={[titleFont(22), { color: colors.ink }]}>최대 8명이 함께 겨뤄요</Text>
        <Muted style={{ textAlign: 'center' }}>
          방을 만들고 링크를 보내면 친구는 앱 없이{'\n'}닉네임만 입력하고 바로 들어와요.
        </Muted>
      </Card>
      <View>
        <BattleActions />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 10, paddingVertical: 28 },
});
