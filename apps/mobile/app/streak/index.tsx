import type { StreakDayState } from '@zuirock/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { Button } from '../../src/components/Button';
import { Icon, type IconName } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { Card, ErrorText, Muted } from '../../src/components/ui';
import { AnimatedNumber, Bob, Pulse, Rise, Skeleton, Twinkle } from '../../src/components/motion';
import { EconomyApi } from '../../src/features/economy/api';
import { kstDay, kstMonth, monthGrid, shiftMonth } from '../../src/features/economy/logic';
import { emit } from '../../src/lib/events';
import { useAsync } from '../../src/lib/useAsync';
import { bodyFont, colors, radius, titleFont } from '../../src/theme';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_STYLE: Record<StreakDayState, { bg: string; fg: string; icon?: IconName; label: string }> = {
  studied: { bg: colors.cheese, fg: colors.ink, icon: 'flame', label: '학습함' },
  protected: { bg: colors.lavenderStrong, fg: colors.primary, icon: 'check', label: '보호권 사용' },
  missed: { bg: colors.coralSoft, fg: colors.wrong, label: '놓침' },
  none: { bg: colors.track, fg: colors.inkMuted, label: '기록 전' },
  today: { bg: colors.white, fg: colors.primary, label: '오늘' },
  future: { bg: 'transparent', fg: colors.inkMuted, label: '' },
};

/** 연속학습 (item 2): this month's calendar, streaks, protections and the next milestone. */
export default function Streak() {
  const router = useRouter();
  const thisMonth = kstMonth(new Date());
  const [month, setMonth] = useState(thisMonth);
  const cal = useAsync(() => EconomyApi.calendar(month), [month]);
  const [y, m] = month.split('-');
  const grid = cal.data ? monthGrid(month, cal.data.days, kstDay(new Date())) : null;
  const go = (d: number) => {
    emit('tap');
    setMonth(shiftMonth(month, d));
  };

  return (
    <Screen title="연속 학습">
      <View style={styles.stats}>
        <Rise i={0} style={{ flex: 1 }}>
          <Card style={[styles.stat, { backgroundColor: colors.coralSoft, borderColor: colors.coralSoft }]}>
            <Pulse active={(cal.data?.current ?? 0) > 0}>
              <Icon name="flame" size={26} color={colors.wrong} />
            </Pulse>
            {cal.data ? <AnimatedNumber value={cal.data.current} suffix="일" style={[titleFont(30), { color: colors.ink }]} /> : <Text style={[titleFont(30), { color: colors.ink }]}>–</Text>}
            <Muted>현재 연속</Muted>
          </Card>
        </Rise>
        <Rise i={1} style={{ flex: 1 }}>
          <Card style={styles.stat}>
            <Bob distance={3}>
              <Icon name="star" size={26} color={colors.cheese} filled />
            </Bob>
            {cal.data ? <AnimatedNumber value={cal.data.longest} suffix="일" style={[titleFont(30), { color: colors.ink }]} /> : <Text style={[titleFont(30), { color: colors.ink }]}>–</Text>}
            <Muted>최장 연속</Muted>
          </Card>
        </Rise>
      </View>

      {cal.data?.nextMilestone ? (
        <Rise i={2}>
        <View style={styles.milestone}>
          <Twinkle style={{ top: 12, right: 28 }} size={6} />
          <Twinkle style={{ bottom: 14, right: 90 }} size={5} delay={700} color={colors.cheese} />
          <Text style={[titleFont(18), { color: colors.white }]}>
            {cal.data.nextMilestone.days}일 달성까지 {cal.data.nextMilestone.daysLeft}일 남았어요
          </Text>
          <View style={styles.milestoneReward}>
            <Icon name="cheese" size={16} color={colors.cheese} />
            <Text style={[bodyFont(15, '800'), { color: colors.white }]}>보상 치즈 {cal.data.nextMilestone.cheese}</Text>
          </View>
        </View>
        </Rise>
      ) : null}

      <Rise i={3}>
      <Card style={{ gap: 12 }}>
        <View style={styles.monthNav}>
          <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => go(-1)} hitSlop={10} style={styles.navBtn}>
            <Icon name="back" size={22} color={colors.ink} />
          </Pressable>
          <Text testID="streak-month" style={[titleFont(20), { color: colors.ink, flex: 1, textAlign: 'center' }]}>
            {y}년 {Number(m)}월
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="다음 달"
            accessibilityState={{ disabled: month >= thisMonth }}
            disabled={month >= thisMonth}
            onPress={() => go(1)}
            hitSlop={10}
            style={[styles.navBtn, { transform: [{ scaleX: -1 }], opacity: month >= thisMonth ? 0.25 : 1 }]}
          >
            <Icon name="back" size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.week}>
          {WEEKDAYS.map((d, i) => (
            <Text key={d} style={[bodyFont(13, '700'), styles.cell, { color: i === 0 ? colors.wrong : colors.inkMuted, height: 20 }]}>
              {d}
            </Text>
          ))}
        </View>
        {grid
          ? grid.map((week, w) => (
              <View key={w} style={styles.week}>
                {week.map((c, i) => {
                  if (!c) return <View key={i} style={styles.cell} />;
                  const s = DAY_STYLE[c.state];
                  // Days pop in as a diagonal wave (week + weekday), capped so late weeks don't wait long.
                  const wave = Math.min(w * 3 + i, 22) * 22;
                  return (
                    <Animated.View
                      key={`${month}-${i}`}
                      entering={ZoomIn.delay(wave).duration(220).reduceMotion(ReduceMotion.System)}
                      accessibilityLabel={`${c.day}일 ${s.label}`}
                      style={[styles.cell, styles.day, { backgroundColor: s.bg }, c.state === 'today' ? styles.today : null]}
                    >
                      {s.icon ? <Icon name={s.icon} size={14} color={s.fg} /> : null}
                      <Text style={[bodyFont(13, '800'), { color: s.fg }]}>{c.day}</Text>
                    </Animated.View>
                  );
                })}
              </View>
            ))
          : cal.loading
            ? <Skeleton height={240} />
            : null}
        <ErrorText>{cal.error}</ErrorText>
        <View style={styles.legend}>
          {(['studied', 'protected', 'missed', 'none', 'today'] as const).map((k) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: DAY_STYLE[k].bg }, k === 'today' ? styles.today : null]} />
              <Muted style={{ fontSize: 13 }}>{DAY_STYLE[k].label}</Muted>
            </View>
          ))}
        </View>
      </Card>
      </Rise>

      <Rise i={4}>
      <Card style={styles.protect}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[titleFont(18), { color: colors.ink }]}>보유 보호권 {cal.data ? `${cal.data.protectionsHeld}개` : ''}</Text>
          <Muted>학습을 못 한 날이 끝나면 자동으로 써서 연속을 지켜줘요 (최대 2개)</Muted>
        </View>
        <Button size="sm" variant="cheese" label="상점" onPress={() => router.push('/shop')} style={{ width: 80 }} />
      </Card>
      </Rise>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 16 },
  milestone: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: 16, gap: 6, overflow: 'hidden' },
  milestoneReward: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthNav: { flexDirection: 'row', alignItems: 'center' },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row', gap: 4 },
  cell: { flex: 1, textAlign: 'center' },
  day: { aspectRatio: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 2, borderColor: colors.primary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 14, height: 14, borderRadius: 4 },
  protect: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
