import { useEffect, useState, type ReactNode } from 'react';
import { Image, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Ellipse, Path } from 'react-native-svg';
import BODY_GRAY from '../../assets/character/body-gray.png';
import PART_BODY from '../../assets/character/part-body.png';
import PART_EAR_L from '../../assets/character/part-ear-left.png';
import PART_EAR_R from '../../assets/character/part-ear-right.png';
import PART_FOOT_L from '../../assets/character/part-foot-left.png';
import PART_FOOT_R from '../../assets/character/part-foot-right.png';
import PART_TAIL from '../../assets/character/part-tail.png';
import FACE_DIFFICULT from '../../assets/character/face-difficult.png';
import FACE_SMILE from '../../assets/character/face-smile.png';
import EYES from '../../assets/character/eyes.png';
import NOSE from '../../assets/character/nose.png';
import { colors } from '../theme';

export type MascotMood = 'smile' | 'happy' | 'surprised' | 'glasses';
/** Built-in layers a worn item can replace (CharacterLayers). */
export type MascotPart = 'eyes' | 'nose' | 'tail';
/** idle = breathing, ears and tail sway; cheer = hop, wag, stomp; sad = ears and tail droop; none = still. Default: idle from 90px up. */
export type MascotMotion = 'idle' | 'cheer' | 'sad' | 'none';


/** Design-file coordinates (body.png is 855×764; layers were matched against the full character art). */
const W = 855;
const H = 764;
const EYES_BOX = { x: 92, y: 285, w: 298, h: 225 };
const NOSE_BOX = { x: 196, y: 487, w: 76, h: 61 };
const INK = '#2A1F5C';
/** Parts cut from the Figma art, in the same 855×764 space (positions fitted against the full art). */
type Box = { x: number; y: number; w: number; h: number };
const BOX = {
  tail: { x: 636, y: 529, w: 219, h: 83 },
  earL: { x: 95, y: 1, w: 230, h: 251 },
  earR: { x: 390, y: 0, w: 228, h: 251 },
  footL: { x: 92, y: 662, w: 135, h: 68 },
  footR: { x: 227, y: 696, w: 135, h: 68 },
  body: { x: 0, y: 132, w: 719, h: 598 },
} satisfies Record<string, Box>;

/** Pixel size → body-space helper so every layer scales with `size`. */
const px = (v: number, s: number) => v * s;

/**
 * The mouse from the Figma art: body + eyes + nose layers. There is no mouth in the design, so moods
 * change the eyes (sparkle → closed arcs → wide → glasses) and add a small mouth only where it helps.
 * `size` is the box edge; the art is wider than tall and sits centred in it. `gray` is the guest look.
 * `under`/`over` are extra layers in the body box (behind / in front of the body); `without` drops built-in parts.
 */
export function Mascot({
  size = 56,
  mood = 'smile',
  gray,
  crown,
  blink,
  motion,
  motionFor,
  without = [],
  finished,
  under,
  over,
}: {
  size?: number;
  mood?: MascotMood;
  gray?: boolean;
  crown?: boolean;
  blink?: boolean;
  motion?: MascotMotion;
  /** Play `motion` for this many ms, then settle into idle. Omit to keep it. */
  motionFor?: number;
  without?: MascotPart[];
  /** Use the finished smile / struggling art (battle, stickers, chat). Default is the layered default character that the wardrobe dresses. */
  finished?: boolean;
  under?: ReactNode;
  over?: ReactNode;
}) {
  const [cue, setCue] = useState<MascotMotion | undefined>(motion);
  useEffect(() => {
    setCue(motion);
    if (!motion || motion === 'idle' || motion === 'none' || !motionFor) return;
    const id = setTimeout(() => setCue('idle'), motionFor);
    return () => clearTimeout(id);
  }, [motion, motionFor]);
  const mode: MascotMotion = cue ?? (size >= 90 ? 'idle' : 'none');
  const blinking = (blink ?? size >= 90) && mood !== 'happy';
  // Finished art (opt-in): smiling (smile/happy) or struggling (surprised). Glasses, the guest gray look and worn eye/nose/tail items use the layered build.
  const face = finished && !gray && without.length === 0 && mood !== 'glasses' ? (mood === 'surprised' ? FACE_DIFFICULT : FACE_SMILE) : null;
  return face ? (
    <FaceMascot size={size} face={face} mode={mode} crown={crown} under={under} over={over} />
  ) : (
    <LayeredMascot size={size} mood={mood} gray={gray} crown={crown} blinking={blinking} mode={mode} without={without} under={under} over={over} />
  );
}

/** Phase 0↔1 ping-pong that drives every part; its speed follows the motion. Reduced motion pins it. */
function usePhase(mode: MascotMotion) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced || mode === 'none' || mode === 'sad') {
      t.value = withTiming(mode === 'sad' ? 1 : 0, { duration: 260, easing: Easing.out(Easing.quad) });
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: mode === 'cheer' ? 210 : 1700, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [mode, reduced, t]);
  return t;
}

/** Whole-body motion shared by both builds: breathing, cheer hop (rises on every half beat), sad slump. */
function useBodyStyle(t: { value: number }, mode: MascotMotion, size: number) {
  return useAnimatedStyle(() => {
    if (mode === 'cheer') return { transform: [{ translateY: -size * 0.07 * t.value }, { scaleY: 1 + 0.05 * (1 - t.value) }, { scaleX: 1 - 0.03 * (1 - t.value) }] };
    if (mode === 'sad') return { transform: [{ translateY: size * 0.02 * t.value }, { scaleY: 1 - 0.04 * t.value }, { scaleX: 1 + 0.02 * t.value }] };
    if (mode === 'idle') return { transform: [{ scaleY: 1 + 0.018 * t.value }, { scaleX: 1 - 0.01 * t.value }] };
    return { transform: [] };
  });
}

function FaceMascot({ size, face, mode, crown, under, over }: { size: number; face: number; mode: MascotMotion; crown?: boolean; under?: ReactNode; over?: ReactNode }) {
  const s = size / W;
  const h = H * s;
  const t = usePhase(mode);
  const body = useBodyStyle(t, mode, size);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ width: size, height: h, transformOrigin: '50% 100%' }, body]}>
        {under}
        <Image source={face} style={{ position: 'absolute', width: size, height: h }} resizeMode="contain" />
        {crown ? (
          <Svg width={size} height={h} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute' }}>
            <Path d="M262 158 L250 40 L308 92 L357 14 L406 92 L464 40 L452 158 Z" fill={colors.cheese} stroke={colors.cheeseDark} strokeWidth={12} strokeLinejoin="round" />
          </Svg>
        ) : null}
        {over}
      </Animated.View>
    </View>
  );
}

/** One cut-out part: positioned in body space, swings around `origin`, driven by the shared phase. */
function Part({ source, box, s, origin, t, sway }: { source: number; box: Box; s: number; origin: string; t: { value: number }; sway: (t: number) => { rotate?: number; y?: number } }) {
  const anim = useAnimatedStyle(() => {
    const v = sway(t.value);
    return { transform: [{ translateY: (v.y ?? 0) * s }, { rotate: `${v.rotate ?? 0}deg` }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: px(box.x, s), top: px(box.y, s), width: px(box.w, s), height: px(box.h, s), transformOrigin: origin }, anim]}>
      <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
    </Animated.View>
  );
}

function LayeredMascot({
  size,
  mood,
  gray,
  crown,
  blinking,
  mode,
  without,
  under,
  over,
}: {
  size: number;
  mood: MascotMood;
  gray?: boolean;
  crown?: boolean;
  blinking: boolean;
  mode: MascotMotion;
  without: MascotPart[];
  under?: ReactNode;
  over?: ReactNode;
}) {
  const s = size / W;
  const h = H * s;
  const t = usePhase(mode);
  const body = useBodyStyle(t, mode, size);
  // Ear / tail / foot swing per motion. Degrees and body-space pixels; t is the 0↔1 phase (sad stays at 1).
  const earL = (v: number) => {
    'worklet';
    return (mode === 'cheer' ? { rotate: -9 * v, y: -8 * v } : mode === 'sad' ? { rotate: -20 * v, y: 14 * v } : { rotate: -3 + 6 * v });
  };
  const earR = (v: number) => {
    'worklet';
    return (mode === 'cheer' ? { rotate: 9 * (1 - v), y: -8 * (1 - v) } : mode === 'sad' ? { rotate: 20 * v, y: 14 * v } : { rotate: 3 - 6 * v });
  };
  const tail = (v: number) => {
    'worklet';
    return (mode === 'cheer' ? { rotate: -20 + 40 * v } : mode === 'sad' ? { rotate: 24 * v, y: 10 * v } : { rotate: -9 + 18 * v });
  };
  const footL = (v: number) => {
    'worklet';
    return (mode === 'cheer' ? { y: -16 * v } : {});
  };
  const footR = (v: number) => {
    'worklet';
    return (mode === 'cheer' ? { y: -16 * (1 - v) } : {});
  };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ width: size, height: h, transformOrigin: '50% 100%' }, body]}>
        {under}
        {gray ? (
          <Image source={BODY_GRAY} style={{ position: 'absolute', width: size, height: h }} resizeMode="contain" />
        ) : (
          <>
            {without.includes('tail') ? null : <Part source={PART_TAIL} box={BOX.tail} s={s} origin="4% 60%" t={t} sway={tail} />}
            <Part source={PART_EAR_L} box={BOX.earL} s={s} origin="50% 90%" t={t} sway={earL} />
            <Part source={PART_EAR_R} box={BOX.earR} s={s} origin="50% 90%" t={t} sway={earR} />
            <Part source={PART_FOOT_L} box={BOX.footL} s={s} origin="50% 100%" t={t} sway={footL} />
            <Part source={PART_FOOT_R} box={BOX.footR} s={s} origin="50% 100%" t={t} sway={footR} />
            <Image
              source={PART_BODY}
              style={{ position: 'absolute', left: px(BOX.body.x, s), top: px(BOX.body.y, s), width: px(BOX.body.w, s), height: px(BOX.body.h, s) }}
              resizeMode="contain"
            />
          </>
        )}
        {mood === 'happy' || without.includes('eyes') ? null : <Eyes s={s} blinking={blinking} wide={mood === 'surprised'} />}
        {without.includes('nose') ? null : (
          <Image source={NOSE} style={{ position: 'absolute', left: px(NOSE_BOX.x, s), top: px(NOSE_BOX.y, s), width: px(NOSE_BOX.w, s), height: px(NOSE_BOX.h, s) }} />
        )}
        <Svg width={size} height={h} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute' }}>
          {mood === 'happy' ? (
            <>
              {/* closed happy eyes + blush + open smile */}
              <Path d="M105 448 Q165 360 225 448" stroke={INK} strokeWidth={26} fill="none" strokeLinecap="round" />
              <Path d="M262 448 Q322 360 382 448" stroke={INK} strokeWidth={26} fill="none" strokeLinecap="round" />
              <Ellipse cx={100} cy={520} rx={42} ry={24} fill={colors.ear} opacity={0.55} />
              <Ellipse cx={392} cy={520} rx={42} ry={24} fill={colors.ear} opacity={0.55} />
              <Path d="M205 566 Q234 610 263 566 Z" fill={INK} stroke={INK} strokeWidth={8} strokeLinejoin="round" />
            </>
          ) : null}
          {mood === 'surprised' ? <Ellipse cx={234} cy={590} rx={22} ry={28} fill={INK} /> : null}
          {mood === 'glasses' ? (
            <>
              <Ellipse cx={163} cy={398} rx={78} ry={124} stroke={INK} strokeWidth={13} fill="none" />
              <Ellipse cx={320} cy={398} rx={78} ry={124} stroke={INK} strokeWidth={13} fill="none" />
              <Path d="M241 390 L242 390" stroke={INK} strokeWidth={13} strokeLinecap="round" />
            </>
          ) : null}
          {crown ? <Path d="M262 158 L250 40 L308 92 L357 14 L406 92 L464 40 L452 158 Z" fill={colors.cheese} stroke={colors.cheeseDark} strokeWidth={12} strokeLinejoin="round" /> : null}
        </Svg>
        {over}
      </Animated.View>
    </View>
  );
}

/** Eyes layer; blinks (squash vertically) every few seconds on larger mascots. */
function Eyes({ s, blinking, wide }: { s: number; blinking: boolean; wide: boolean }) {
  const reduced = useReducedMotion();
  const sy = useSharedValue(1);
  useEffect(() => {
    if (!blinking || reduced) return;
    // The wait is a withDelay: a timing from 1 to 1 would finish instantly and the eyes would blink non-stop.
    sy.value = withDelay(
      1500 + Math.round(Math.random() * 1500),
      withRepeat(withSequence(withTiming(0.08, { duration: 90 }), withTiming(1, { duration: 120 }), withDelay(3200, withTiming(1, { duration: 1 }))), -1),
    );
  }, [blinking, reduced, sy]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scaleY: sy.value }, { scale: wide ? 1.12 : 1 }] }));
  return (
    <Animated.View
      style={[{ position: 'absolute', left: px(EYES_BOX.x, s), top: px(EYES_BOX.y, s), width: px(EYES_BOX.w, s), height: px(EYES_BOX.h, s) }, anim]}
    >
      <Image source={EYES} style={{ width: '100%', height: '100%' }} />
    </Animated.View>
  );
}
