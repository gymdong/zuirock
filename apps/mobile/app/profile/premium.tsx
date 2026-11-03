import { StyleSheet, View } from 'react-native';
import { Icon } from '../../src/components/Icon';
import { Mascot } from '../../src/components/Mascot';
import { Rise } from '../../src/components/motion';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { Card, Muted, Tag } from '../../src/components/ui';
import { bodyFont, colors, radius, titleFont } from '../../src/theme';

type Cell = string | boolean;
const ROWS: Array<{ title: string; free: Cell; premium: Cell }> = [
  { title: '학습·대결·친구', free: true, premium: true },
  { title: '광고', free: '표시 예정', premium: '광고 제거' },
  { title: '연속 학습 보호권', free: '상점에서 구매', premium: '매달 3개' },
  { title: '경험치 부스트', free: '상자에서 획득', premium: '매주 1개' },
  { title: '약점 리포트', free: '기본', premium: '심화 분석' },
  { title: '프리미엄 꾸미기 아이템', free: false, premium: true },
];

function CellView({ v, premium }: { v: Cell; premium?: boolean }) {
  if (v === true) return <Icon name="check" size={22} color={premium ? colors.primary : colors.mintText} />;
  if (v === false) return <Icon name="close" size={20} color={colors.borderDark} />;
  return <Text style={[bodyFont(13, '800'), { color: premium ? colors.primary : colors.inkSoft, textAlign: 'center' }]}>{v}</Text>;
}

/** 쥐락펴락 프리미엄 소개(미리보기). 결제·구독 기능은 아직 연결되어 있지 않다. */
export default function Premium() {
  return (
    <Screen title="쥐락펴락 프리미엄">
      <Rise i={0}>
        <View style={styles.hero}>
          <Mascot size={96} finished mood="smile" crown motion="cheer" />
          <Text style={[titleFont(26, '900'), { color: colors.white, textAlign: 'center' }]}>쥐락펴락 프리미엄</Text>
          <Text style={[bodyFont(15, '700'), { color: colors.lavenderStrong, textAlign: 'center' }]}>
            광고 없이, 더 꾸준히, 더 깊이 배워요
          </Text>
          <View style={styles.price}>
            <Text style={[titleFont(22, '900'), { color: colors.ink }]}>월 3,900원</Text>
            <Text style={[bodyFont(12, '700'), { color: colors.cheeseText }]}>예시 가격</Text>
          </View>
        </View>
      </Rise>

      <Rise i={1}>
        <Card style={{ gap: 0, padding: 0, overflow: 'hidden' }}>
          <View style={[styles.row, { backgroundColor: colors.lavender }]}>
            <Text style={[bodyFont(14, '800'), { flex: 1.4, color: colors.inkSoft }]}>혜택</Text>
            <Text style={[bodyFont(14, '800'), styles.col, { color: colors.inkSoft, textAlign: 'center' }]}>무료</Text>
            <Text style={[bodyFont(14, '900'), styles.col, { color: colors.primary, textAlign: 'center' }]}>프리미엄</Text>
          </View>
          {ROWS.map((r, i) => (
            <View key={r.title} style={[styles.row, i > 0 && styles.rowLine]}>
              <Text style={[bodyFont(15, '800'), { flex: 1.4, color: colors.ink }]}>{r.title}</Text>
              <View style={styles.col}>
                <CellView v={r.free} />
              </View>
              <View style={styles.col}>
                <CellView v={r.premium} premium />
              </View>
            </View>
          ))}
        </Card>
      </Rise>

      <Rise i={2}>
        <Card style={{ gap: 8, alignItems: 'flex-start' }}>
          <Tag label="준비 중" bg={colors.cheeseSoft} color={colors.cheeseText} />
          <Text style={[titleFont(18), { color: colors.ink }]}>곧 만나요!</Text>
          <Muted>
            지금은 미리보기 화면이에요. 아직 결제와 구독은 열려 있지 않고, 무료 버전은 지금처럼 모든 학습과 대결을 그대로 쓸 수 있어요. 광고는 무료 버전에 도입할 때를 가정한 안내예요.
          </Muted>
        </Card>
      </Rise>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    borderBottomWidth: 6,
    borderBottomColor: colors.primaryDark,
    padding: 22,
    alignItems: 'center',
    gap: 8,
  },
  price: { marginTop: 4, backgroundColor: colors.cheese, borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 8, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.border },
  col: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
