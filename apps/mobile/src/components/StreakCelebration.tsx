import type { StreakAdvanceDto } from '@zuirock/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { emit } from '../lib/events';
import { bodyFont, colors, radius, titleFont } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { Bob, Confetti, Pop, Twinkle } from './motion';
import { Text } from './Text';

/** 7 dots toward the next milestone window: the last one is today's, popping in after the count flips. */
function Dots({ current }: { current: number }) {
  const filled = Math.min(7, current);
  return (
    <View style={styles.dots}>
      {Array.from({ length: 7 }, (_, i) => {
        const on = i < filled;
        const today = i === filled - 1;
        return (
          <Animated.View
            key={i}
            entering={ZoomIn.delay(900 + i * 70).springify().damping(9).reduceMotion(ReduceMotion.System)}
            style={[styles.dot, on && styles.dotOn, today && styles.dotToday]}
          >
            {on ? <Icon name="check" size={14} color={colors.white} /> : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * 연속 학습이 오늘 이어진 순간의 전체 화면 연출: 불꽃이 커지고 숫자가 한 칸 올라간다.
 * 기념일(3·7·14·30일)이면 더 큰 문구와 치즈 보상, 새로 시작하면 '연속 학습 시작!'.
 */
export function StreakCelebration({ advance, onDone }: { advance: StreakAdvanceDto; onDone: () => void }) {
  const { current, startedNew, milestone, nextMilestone } = advance;
  const [shown, setShown] = useState(Math.max(0, current - 1));
  useEffect(() => {
    emit('streak', { days: current });
    const t = setTimeout(() => setShown(current), 650);
    return () => clearTimeout(t);
  }, [current]);

  const title = milestone ? `${milestone.days}일 연속 달성!` : startedNew ? '연속 학습 시작!' : `${current}일 연속 학습!`;
  const remain = nextMilestone ? nextMilestone.days - current : null;

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(220)} style={styles.scrim}>
      <View style={styles.center}>
        <View style={styles.glowBox}>
          <View style={styles.glow} />
        </View>
        <Animated.View entering={ZoomIn.delay(100).springify().damping(7).stiffness(180).reduceMotion(ReduceMotion.System)}>
          <Bob distance={8}>
            <Icon name="flame" size={150} color="#FF8A3D" filled />
          </Bob>
        </Animated.View>
        <Twinkle delay={200} size={12} style={{ position: 'absolute', top: '24%', left: '24%' }} />
        <Twinkle delay={650} size={9} style={{ position: 'absolute', top: '30%', right: '22%' }} />
        <Pop trigger={shown}>
          <Text style={[titleFont(88, '900'), styles.count]}>{shown}</Text>
        </Pop>
        <Animated.View entering={FadeInDown.delay(300).duration(260).reduceMotion(ReduceMotion.System)}>
          <Text style={[titleFont(32, '900'), styles.title]}>{title}</Text>
        </Animated.View>
        <Dots current={current} />
        {milestone ? (
          <Animated.View entering={ZoomIn.delay(1200).springify().damping(8).reduceMotion(ReduceMotion.System)} style={styles.reward}>
            <Icon name="cheese" size={22} color={colors.cheese} />
            <Text style={[titleFont(20), { color: colors.ink }]}>치즈 +{milestone.cheese}</Text>
          </Animated.View>
        ) : remain !== null ? (
          <Text style={[bodyFont(16, '700'), { color: colors.white, textAlign: 'center' }]}>
            {nextMilestone!.days}일 연속까지 {remain}일 남았어요 (치즈 +{nextMilestone!.cheese})
          </Text>
        ) : (
          <Text style={[bodyFont(16, '700'), { color: colors.white, textAlign: 'center' }]}>내일도 이어가 봐요!</Text>
        )}
        <Button variant="cheese" size="md" label="계속하기" onPress={onDone} style={{ minWidth: 180, marginTop: 6 }} />
      </View>
      <Confetti count={milestone ? 44 : 22} style={{ top: '38%' }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(36,27,77,0.86)', zIndex: 110 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  glowBox: { position: 'absolute', top: '16%', alignItems: 'center', justifyContent: 'center' },
  glow: { width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(255,138,61,0.22)' },
  count: { color: colors.white, textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0, lineHeight: 96, marginTop: -8 },
  title: { color: colors.cheese, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 8, marginVertical: 14 },
  dot: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: '#FF8A3D' },
  dotToday: { borderWidth: 3, borderColor: colors.cheese },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cheeseSoft, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 10, marginBottom: 4 },
});
