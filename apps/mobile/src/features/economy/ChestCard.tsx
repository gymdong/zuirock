import type { ChestGrantDto, ChestReward, OpenChestResponse } from '@zuirock/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ApiError, errorMessage } from '../../api/client';
import { sound } from '../../audio';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { CrumbBurst } from '../../components/fx';
import { AnimatedNumber, Bob, Twinkle } from '../../components/motion';
import { ErrorText, Muted } from '../../components/ui';
import { emit } from '../../lib/events';
import { colors, radius, titleFont } from '../../theme';
import { EconomyApi, setCheese } from './api';
import { mergeRewards, rewardLabel } from './logic';

const TIER = {
  normal: { title: '보상 상자', body: colors.mouse, band: colors.cheese, lid: '#6A5AE0', bg: colors.lavender },
  good: { title: '좋은 상자', body: colors.cheese, band: colors.primary, lid: colors.cheeseDark, bg: colors.cheeseSoft },
} as const;

/** Chest drawn with Views: the lid wiggles while opening, then springs up off the box. */
export function ChestArt({ tier, phase, size = 120 }: { tier: ChestGrantDto['tier']; phase: 'closed' | 'opening' | 'open'; size?: number }) {
  const reduced = useReducedMotion();
  const t = TIER[tier];
  const wiggle = useSharedValue(0);
  const lid = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    if (phase === 'opening' && !reduced) wiggle.value = withRepeat(withSequence(withTiming(-6, { duration: 70 }), withTiming(6, { duration: 70 })), -1, true);
    else wiggle.value = withTiming(0, { duration: 80 });
    if (phase === 'open') {
      lid.value = reduced ? 1 : withSpring(1, { damping: 9, stiffness: 140 });
      glow.value = withTiming(1, { duration: reduced ? 0 : 500, easing: Easing.out(Easing.quad) });
    }
  }, [phase, reduced, wiggle, lid, glow]);
  const boxAnim = useAnimatedStyle(() => ({ transform: [{ rotate: `${wiggle.value}deg` }] }));
  const lidAnim = useAnimatedStyle(() => ({ transform: [{ translateY: -size * 0.32 * lid.value }, { rotate: `${-18 * lid.value}deg` }] }));
  const glowAnim = useAnimatedStyle(() => ({ opacity: 0.85 * glow.value, transform: [{ scale: 0.5 + 0.5 * glow.value }] }));
  const w = size;
  const h = size * 0.62;
  return (
    <Animated.View style={[{ width: w, height: h + size * 0.66, justifyContent: 'flex-end', alignItems: 'center' }, boxAnim]}>
      <Animated.View style={[styles.glow, { width: w * 1.2, height: w * 1.2, borderRadius: w, top: 0, backgroundColor: colors.white }, glowAnim]} />
      <View style={{ width: w, height: h, borderRadius: radius.md, backgroundColor: t.body, borderBottomWidth: 6, borderBottomColor: 'rgba(0,0,0,0.18)', alignItems: 'center' }}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, width: w * 0.16, backgroundColor: t.band }} />
        <View style={[styles.lock, { top: h * 0.08, backgroundColor: t.band }]} />
      </View>
      <Animated.View style={[{ position: 'absolute', bottom: h - 4, width: w * 1.06, height: size * 0.3, borderRadius: radius.md, backgroundColor: t.lid, alignItems: 'center' }, lidAnim]}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, width: w * 0.16, backgroundColor: t.band }} />
      </Animated.View>
      {tier === 'good' ? (
        <View style={{ position: 'absolute', top: 0, right: -6 }}>
          <Icon name="sparkle" size={26} color={colors.cheeseDark} />
        </View>
      ) : null}
    </Animated.View>
  );
}

function RewardRow({ r, i }: { r: ChestReward; i: number }) {
  const cheese = r.type === 'cheese';
  return (
    <Animated.View
      entering={FadeInUp.delay(250 + i * 180).springify().reduceMotion(ReduceMotion.System)}
      style={[styles.reward, { backgroundColor: colors.white, borderColor: cheese ? colors.cheese : colors.correct }]}
    >
      <Icon name={cheese ? 'cheese' : 'star'} size={22} color={cheese ? colors.cheese : colors.correct} filled />
      {cheese ? (
        <AnimatedNumber value={r.amount} prefix="치즈 +" duration={1000} style={[titleFont(20), { color: colors.ink, textAlign: 'left' }]} />
      ) : (
        <Text style={[titleFont(18), { color: colors.ink }]}>{rewardLabel(r)} +1</Text>
      )}
    </Animated.View>
  );
}

/** Stage first-clear chest (item 3): open on the result screen or later from the shop inventory. */
export function ChestCard({ chest, onOpened, compact }: { chest: ChestGrantDto; onOpened?: (r: OpenChestResponse) => void; compact?: boolean }) {
  const [phase, setPhase] = useState<'closed' | 'opening' | 'open'>('closed');
  const [rewards, setRewards] = useState<ChestReward[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = TIER[chest.tier];

  const open = async () => {
    setPhase('opening');
    setError(null);
    try {
      const [res] = await Promise.all([EconomyApi.openChest(chest.id), new Promise((r) => setTimeout(r, 700))]);
      setRewards(mergeRewards(res.rewards));
      setPhase('open');
      emit('chestOpen', { tier: chest.tier });
      setCheese(res.cheese);
      onOpened?.(res);
    } catch (e) {
      setPhase('closed');
      sound.play('error');
      setError(e instanceof ApiError && e.status === 409 ? '이미 연 상자예요' : e instanceof ApiError && e.status >= 500 ? '상자를 열지 못했어요. 잠시 후 다시 시도해 주세요' : errorMessage(e));
    }
  };

  return (
    <View testID={`chest-${chest.id}`} style={[styles.card, { backgroundColor: t.bg, borderColor: chest.tier === 'good' ? colors.cheese : colors.lavenderStrong }]}>
      {phase === 'open' ? <CrumbBurst count={chest.tier === 'good' ? 40 : 24} power={chest.tier === 'good' ? 1.4 : 1} /> : null}
      <Text style={[titleFont(compact ? 18 : 22), { color: colors.ink }]}>
        {phase === 'open' ? `${t.title}를 열었어요!` : chest.tier === 'good' ? '좋은 상자를 받았어요!' : '보상 상자를 받았어요!'}
      </Text>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {phase === 'closed' && chest.tier === 'good' ? (
          <>
            <Twinkle style={{ top: 6, left: -26 }} size={7} color={colors.cheeseDark} />
            <Twinkle style={{ top: 30, right: -30 }} size={6} delay={500} color={colors.cheeseDark} />
            <Twinkle style={{ bottom: 18, left: -34 }} size={5} delay={900} color={colors.cheeseDark} />
          </>
        ) : null}
        {phase === 'closed' ? (
          <Bob distance={4}>
            <ChestArt tier={chest.tier} phase={phase} size={compact ? 84 : 120} />
          </Bob>
        ) : (
          <ChestArt tier={chest.tier} phase={phase} size={compact ? 84 : 120} />
        )}
      </View>
      {rewards ? (
        <View style={{ gap: 8, alignSelf: 'stretch' }}>
          {rewards.map((r, i) => (
            <RewardRow key={i} r={r} i={i} />
          ))}
        </View>
      ) : (
        <>
          {!compact ? <Muted style={{ textAlign: 'center' }}>{chest.tier === 'good' ? '5의 배수 스테이지 첫 클리어 보상이에요' : '스테이지 첫 클리어 보상이에요'}</Muted> : null}
          <Button testID="chest-open" variant="cheese" size={compact ? 'sm' : 'md'} label="상자 열기" loading={phase === 'opening'} onPress={open} style={{ alignSelf: 'stretch' }} />
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 2, borderBottomWidth: 5, padding: 18, alignItems: 'center', gap: 12, overflow: 'hidden' },
  glow: { position: 'absolute', alignSelf: 'center' },
  lock: { position: 'absolute', width: 18, height: 22, borderRadius: 6, borderWidth: 3, borderColor: colors.ink },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.md, borderWidth: 2, borderBottomWidth: 5, paddingHorizontal: 14, paddingVertical: 10 },
});
