import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { MAX_FONT_SCALE, Text } from './Text';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  ZoomIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { bodyFont, colors, titleFont } from '../theme';
import { Button } from './Button';
import { Mascot, type MascotMood } from './Mascot';

/**
 * 치즈 마을 effects (10/26): reactions that answer what the player just did. Every effect runs on the
 * UI thread and collapses to nothing (or its final state) with the system "reduce motion" setting.
 */

const CRUMB_COLORS = [colors.cheese, colors.cheeseDark, colors.cheeseLight, colors.crust, colors.white];

function Crumb({ dx, dy, rot, color, delay, size, round }: { dx: number; dy: number; rot: number; color: string; delay: number; size: number; round: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [delay, p]);
  const anim = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : 1 - Math.max(0, p.value - 0.55) / 0.45,
    transform: [{ translateX: dx * p.value }, { translateY: dy * p.value + 260 * p.value * p.value }, { rotate: `${rot * p.value}deg` }, { scale: 1 - 0.4 * p.value }],
  }));
  return (
    <Animated.View
      style={[
        round
          ? { position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }
          : // a tiny cheese wedge (triangle)
            { position: 'absolute', width: 0, height: 0, borderLeftWidth: size / 2, borderRightWidth: size / 2, borderBottomWidth: size, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color },
        anim,
      ]}
    />
  );
}

/** Cheese-crumb burst from the centre of its box (correct answer, reward). Remount (key) to replay. */
export function CrumbBurst({ count = 26, power = 1, style }: { count?: number; power?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const crumbs = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const speed = (80 + Math.random() * 140) * power;
        return {
          dx: Math.cos(angle) * speed,
          dy: Math.sin(angle) * speed - 150 * power,
          rot: (Math.random() - 0.5) * 900,
          color: CRUMB_COLORS[i % CRUMB_COLORS.length]!,
          delay: Math.random() * 90,
          size: 7 + Math.random() * 9,
          round: i % 3 === 0,
        };
      }),
    [count, power],
  );
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={[styles.center, style]}>
      {crumbs.map((c, i) => (
        <Crumb key={i} {...c} />
      ))}
    </View>
  );
}

/** "+N" that pops, then flies up-right towards the scoreboard and shrinks away. Remount to replay. */
export function ScoreFly({ text, color = colors.correct, to = { x: 90, y: -230 }, style }: { text: string; color?: string; to?: { x: number; y: number }; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  const s = useSharedValue(0.4);
  useEffect(() => {
    if (reduced) return;
    s.value = withSequence(withSpring(1.35, { damping: 6, stiffness: 260 }), withTiming(1, { duration: 160 }));
    p.value = withDelay(420, withTiming(1, { duration: 520, easing: Easing.in(Easing.cubic) }));
  }, [reduced, p, s]);
  const anim = useAnimatedStyle(() => ({
    opacity: 1 - Math.max(0, p.value - 0.7) / 0.3,
    transform: [{ translateX: to.x * p.value }, { translateY: to.y * p.value }, { scale: s.value * (1 - 0.6 * p.value) }],
  }));
  if (reduced) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.center, anim, style]}>
      <Text style={[titleFont(44, '900'), styles.scoreText, { color }]}>{text}</Text>
    </Animated.View>
  );
}

export interface Cue {
  id: number;
  mood: MascotMood;
  text: string;
}

/** The mouse pops up from the bottom edge with a one-line reaction, wobbles, and ducks away. */
export function MascotCameo({ cue, side = 'right' }: { cue: Cue | null; side?: 'left' | 'right' }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(170);
  const r = useSharedValue(0);
  // JS-side safety net: the cameo is removed after its moment even if animation frames were throttled.
  const [hiddenId, setHiddenId] = useState<number | null>(null);
  useEffect(() => {
    if (!cue) return;
    const t = setTimeout(() => setHiddenId(cue.id), 1900);
    return () => clearTimeout(t);
  }, [cue?.id]);
  useEffect(() => {
    if (!cue) return;
    if (reduced) {
      y.value = 0;
      y.value = withDelay(1400, withTiming(170, { duration: 1 }));
      return;
    }
    y.value = withSequence(withSpring(0, { damping: 9, stiffness: 180 }), withDelay(1100, withTiming(170, { duration: 260, easing: Easing.in(Easing.quad) })));
    r.value = withSequence(withTiming(-8, { duration: 120 }), withTiming(8, { duration: 160 }), withTiming(-4, { duration: 140 }), withTiming(0, { duration: 120 }));
  }, [cue?.id, reduced, y, r]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { rotate: `${r.value}deg` }] }));
  if (!cue || hiddenId === cue.id) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.cameo, side === 'right' ? { right: 6 } : { left: 6 }, anim]}>
      <View style={styles.cameoBubble}>
        <Text style={[bodyFont(15, '800'), { color: colors.ink }]} numberOfLines={1}>
          {cue.text}
        </Text>
      </View>
      <Mascot size={110} mood={cue.mood} blink={false} finished />
    </Animated.View>
  );
}

/**
 * Fever (combo ≥ 3): a glowing cheese frame around the screen plus a combo badge; level 2 (≥ 5) burns
 * hotter (crust orange, faster pulse). Level 0 renders nothing.
 */
export function FeverFrame({ level, combo }: { level: 0 | 1 | 2; combo: number }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(0.6);
  useEffect(() => {
    if (!level || reduced) return;
    const d = level === 2 ? 320 : 600;
    o.value = withRepeat(withSequence(withTiming(1, { duration: d }), withTiming(0.45, { duration: d })), -1);
  }, [level, reduced, o]);
  const glow = useAnimatedStyle(() => ({ opacity: o.value }));
  if (!level) return null;
  const color = level === 2 ? colors.crust : colors.cheese;
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.frame, { borderColor: color }, glow]} />
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} pointerEvents="none" style={[styles.feverBadge, { backgroundColor: color }]}>
        <Text style={[titleFont(15, '900'), { color: level === 2 ? colors.white : colors.ink }]}>{level === 2 ? '🔥 FEVER' : '콤보'} ×{combo}</Text>
      </Animated.View>
    </>
  );
}

/** Time pressure: a red vignette breathing in from the edges while `active`. */
export function PressureVignette({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = active ? (reduced ? withTiming(0.6) : withRepeat(withSequence(withTiming(0.9, { duration: 380 }), withTiming(0.35, { duration: 520 })), -1)) : withTiming(0, { duration: 200 });
  }, [active, reduced, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, anim]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="vig" cx="50%" cy="50%" r="75%">
            <Stop offset="55%" stopColor={colors.danger} stopOpacity={0} />
            <Stop offset="100%" stopColor={colors.danger} stopOpacity={0.55} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#vig)" />
      </Svg>
    </Animated.View>
  );
}

/** Rotating cheese-coloured light rays (celebration backdrop). */
function Rays({ size }: { size: number }) {
  const reduced = useReducedMotion();
  const r = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    r.value = withRepeat(withTiming(360, { duration: 9000, easing: Easing.linear }), -1);
  }, [reduced, r]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  const wedges = 14;
  const c = size / 2;
  const paths = Array.from({ length: wedges }, (_, i) => {
    const a0 = (i / wedges) * Math.PI * 2;
    const a1 = a0 + Math.PI / wedges;
    return `M${c} ${c} L${c + Math.cos(a0) * c} ${c + Math.sin(a0) * c} L${c + Math.cos(a1) * c} ${c + Math.sin(a1) * c} Z`;
  });
  return (
    <Animated.View style={[{ width: size, height: size }, spin]}>
      <Svg width={size} height={size}>
        {paths.map((d, i) => (
          <Path key={i} d={d} fill={i % 2 ? colors.cheese : colors.cheeseLight} opacity={0.14} />
        ))}
      </Svg>
    </Animated.View>
  );
}

/** 대각선 띠가 화면을 한 번 쓸고 지나간다(연출 시작 신호). */
function SweepBands() {
  const { width } = useWindowDimensions();
  const x = useSharedValue(-width * 1.4);
  useEffect(() => {
    x.value = withTiming(width * 1.4, { duration: 760, easing: Easing.out(Easing.cubic) });
  }, [width, x]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { rotate: '-18deg' }] }));
  const b = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 0.82 - width * 0.15 }, { rotate: '-18deg' }] }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[{ position: 'absolute', top: '-10%', height: '130%', width: width * 0.42, left: width * 0.3, backgroundColor: 'rgba(255,214,102,0.22)' }, a]} />
      <Animated.View style={[{ position: 'absolute', top: '-10%', height: '130%', width: width * 0.16, left: width * 0.3, backgroundColor: 'rgba(255,255,255,0.16)' }, b]} />
    </View>
  );
}

const RIBBON_COLORS = [colors.cheese, colors.cheeseLight, '#FF8FB1', '#7FD6FF', '#B79CFF', colors.white];

/** 위에서 흔들리며 쏟아지는 종이 조각 한 장. */
function Ribbon({ x, delay, size, color, sway, spin, fall }: { x: number; delay: number; size: number; color: string; sway: number; spin: number; fall: number }) {
  const { height } = useWindowDimensions();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: fall, easing: Easing.in(Easing.quad) }));
  }, [delay, fall, p]);
  const anim = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : 1,
    transform: [
      { translateX: Math.sin(p.value * 9) * sway },
      { translateY: -40 + p.value * (height + 80) },
      { rotate: `${p.value * spin}deg` },
      { scaleX: 0.35 + Math.abs(Math.cos(p.value * 14)) * 0.65 },
    ],
  }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: x, width: size, height: size * 1.7, borderRadius: 2, backgroundColor: color }, anim]} />;
}

/** 연출 내내 화면 위에서 아래로 떨어지는 종이 조각(레퍼런스의 축하 느낌). */
function Ribbons({ count = 34 }: { count?: number }) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        delay: 250 + Math.random() * 1500,
        size: 7 + Math.random() * 6,
        color: RIBBON_COLORS[i % RIBBON_COLORS.length]!,
        sway: 14 + Math.random() * 26,
        spin: (Math.random() - 0.5) * 900,
        fall: 1900 + Math.random() * 1300,
      })),
    [count, width],
  );
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((q, i) => (
        <Ribbon key={i} {...q} />
      ))}
    </View>
  );
}

/** 제목 글자가 하나씩 튀어 오른다. */
function PopTitle({ text, delay = 450 }: { text: string; delay?: number }) {
  const chars = Array.from(text);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
      {chars.map((c, i) =>
        c === ' ' ? (
          <View key={i} style={{ width: 14 }} />
        ) : (
          <Animated.Text
            key={i}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            entering={ZoomIn.delay(delay + i * 55).springify().damping(6).stiffness(240).reduceMotion(ReduceMotion.System)}
            style={[titleFont(46, '900'), styles.celebrateTitle]}
          >
            {c}
          </Animated.Text>
        ),
      )}
    </View>
  );
}

/** 쥐가 위에서 떨어져 납작하게 착지(squash)한 뒤 튀어 오르고, 바닥 그림자가 따라 변한다. */
function DropMascot({ mood, crown }: { mood: MascotMood; crown?: boolean }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(reduced ? 0 : -420);
  const squash = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    y.value = withDelay(120, withTiming(0, { duration: 520, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) squash.value = withSequence(withTiming(1, { duration: 90 }), withSpring(0, { damping: 5, stiffness: 220 }));
    }));
  }, [reduced, y, squash]);
  const body = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scaleX: 1 + squash.value * 0.18 }, { scaleY: 1 - squash.value * 0.2 }],
  }));
  const shadow = useAnimatedStyle(() => ({
    opacity: 0.15 + 0.3 * (1 - Math.min(1, Math.abs(y.value) / 420)),
    transform: [{ scaleX: 0.4 + 0.6 * (1 - Math.min(1, Math.abs(y.value) / 420)) + squash.value * 0.12 }],
  }));
  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.View style={[{ transformOrigin: 'bottom' } as ViewStyle, body]}>
        <Mascot size={200} mood={mood} crown={crown} motion={mood === 'surprised' ? 'sad' : 'cheer'} />
      </Animated.View>
      <Animated.View style={[{ width: 150, height: 18, borderRadius: 75, backgroundColor: '#000', marginTop: -6 }, shadow]} />
    </View>
  );
}

/**
 * Full-screen celebration (level up, stage clear, battle win): 종이 조각이 쏟아지고, 쥐가 떨어져 착지하며,
 * 제목이 글자별로 튀어 오른 뒤 '계속하기'가 올라온다. 화면 아무 데나 누르거나 기다리면 닫힌다.
 */
export function Celebration({ title, subtitle, mood = 'happy', crown, onDone, children }: { title: string; subtitle?: string; mood?: MascotMood; crown?: boolean; onDone: () => void; children?: ReactNode }) {
  const [burst] = useState(() => Date.now());
  useEffect(() => {
    const t = setTimeout(onDone, 6000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(220)} style={styles.celebrate}>
      <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onDone} style={StyleSheet.absoluteFill} />
      <View pointerEvents="box-none" style={styles.celebrateCenter}>
        <SweepBands />
        <View pointerEvents="none" style={styles.raysBox}>
          <Rays size={520} />
        </View>
        <DropMascot mood={mood} crown={crown} />
        <PopTitle text={title} />
        {subtitle ? (
          <Animated.View entering={FadeInDown.delay(1000).duration(320).reduceMotion(ReduceMotion.System)}>
            <Text style={[bodyFont(18, '800'), { color: colors.white, textAlign: 'center' }]}>{subtitle}</Text>
          </Animated.View>
        ) : null}
        {children}
        <Animated.View entering={FadeInDown.delay(1400).springify().damping(12).reduceMotion(ReduceMotion.System)} style={{ marginTop: 18 }}>
          <Button variant="cheese" size="md" label="계속하기" onPress={onDone} style={{ minWidth: 200 }} />
        </Animated.View>
        <CrumbBurst key={burst} count={40} power={1.5} style={{ top: '28%' }} />
      </View>
      <Ribbons />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  scoreText: { textShadowColor: 'rgba(0,0,0,0.18)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  cameo: { position: 'absolute', bottom: -18, alignItems: 'center', zIndex: 60 },
  cameoBubble: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: -6,
  },
  frame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 7, borderRadius: 26, zIndex: 50 },
  feverBadge: { position: 'absolute', top: 6, alignSelf: 'center', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 4, zIndex: 51 },
  // 연출이 나올 때는 뒤 화면이 비치지 않게 불투명하게 덮는다(반투명이면 오히려 지저분하다는 피드백)
  celebrate: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#2A1F66', zIndex: 100 },
  celebrateTap: { flex: 1 },
  celebrateCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  raysBox: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  celebrateTitle: { color: colors.cheese, textAlign: 'center', textShadowColor: colors.crust, textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0 },
});
