import { useEffect } from 'react';
import { Image, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Ellipse, Path } from 'react-native-svg';
import BODY_GRAY from '../../assets/character/body-gray.png';
import BODY from '../../assets/character/body.png';
import EYES from '../../assets/character/eyes.png';
import NOSE from '../../assets/character/nose.png';
import { colors } from '../theme';

export type MascotMood = 'smile' | 'happy' | 'surprised' | 'glasses';


/** Design-file coordinates (body.png is 855×764; layers were matched against the full character art). */
const W = 855;
const H = 764;
const EYES_BOX = { x: 92, y: 285, w: 298, h: 225 };
const NOSE_BOX = { x: 196, y: 487, w: 76, h: 61 };
const INK = '#2A1F5C';

/** Pixel size → body-space helper so every layer scales with `size`. */
const px = (v: number, s: number) => v * s;

/**
 * The mouse from the Figma art: body + eyes + nose layers. There is no mouth in the design, so moods
 * change the eyes (sparkle → closed arcs → wide → glasses) and add a small mouth only where it helps.
 * `size` is the box edge; the art is wider than tall and sits centred in it. `gray` is the guest look.
 */
export function Mascot({ size = 56, mood = 'smile', gray, crown, blink }: { size?: number; mood?: MascotMood; gray?: boolean; crown?: boolean; blink?: boolean }) {
  const s = size / W;
  const h = H * s;
  const blinking = (blink ?? size >= 90) && mood !== 'happy';
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size, height: h }}>
        <Image source={gray ? BODY_GRAY : BODY} style={{ position: 'absolute', width: size, height: h }} resizeMode="contain" />
        {mood === 'happy' ? null : <Eyes s={s} blinking={blinking} wide={mood === 'surprised'} />}
        <Image source={NOSE} style={{ position: 'absolute', left: px(NOSE_BOX.x, s), top: px(NOSE_BOX.y, s), width: px(NOSE_BOX.w, s), height: px(NOSE_BOX.h, s) }} />
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
      </View>
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
