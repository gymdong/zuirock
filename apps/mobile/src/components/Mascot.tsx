import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { colors } from '../theme';

export type MascotMood = 'smile' | 'happy' | 'surprised' | 'glasses';

/** The mouse face (mockup p1). `gray` is used for guests. */
export function Mascot({ size = 56, mood = 'smile', gray, crown }: { size?: number; mood?: MascotMood; gray?: boolean; crown?: boolean }) {
  const body = gray ? '#A9A6B8' : colors.mouse;
  const ear = gray ? '#D6D3E0' : colors.ear;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {crown && <Path d="M36 14l7 8 7-10 7 10 7-8-3 14H39z" fill={colors.cheese} />}
      <Circle cx="24" cy="34" r="17" fill={body} />
      <Circle cx="76" cy="34" r="17" fill={body} />
      <Circle cx="24" cy="34" r="10" fill={ear} />
      <Circle cx="76" cy="34" r="10" fill={ear} />
      <Ellipse cx="50" cy="58" rx="34" ry="32" fill={body} />
      <Ellipse cx="50" cy="70" rx="22" ry="17" fill="#EEEBFD" />
      {mood === 'happy' ? (
        <>
          <Path d="M33 55q5-6 10 0M57 55q5-6 10 0" stroke={colors.ink} strokeWidth={3.5} fill="none" strokeLinecap="round" />
        </>
      ) : mood === 'glasses' ? (
        <>
          <Circle cx="39" cy="55" r="8" fill="#fff" stroke={colors.ink} strokeWidth={3} />
          <Circle cx="61" cy="55" r="8" fill="#fff" stroke={colors.ink} strokeWidth={3} />
          <Circle cx="39" cy="55" r="3" fill={colors.ink} />
          <Circle cx="61" cy="55" r="3" fill={colors.ink} />
        </>
      ) : (
        <>
          <Circle cx="39" cy="54" r={mood === 'surprised' ? 7 : 5} fill={mood === 'surprised' ? '#fff' : colors.ink} />
          <Circle cx="61" cy="54" r={mood === 'surprised' ? 7 : 5} fill={mood === 'surprised' ? '#fff' : colors.ink} />
          {mood === 'surprised' && (
            <>
              <Circle cx="40" cy="54" r="4" fill={colors.ink} />
              <Circle cx="62" cy="54" r="4" fill={colors.ink} />
            </>
          )}
        </>
      )}
      <Ellipse cx="50" cy="66" rx="4.5" ry="3.5" fill="#E86C8D" />
      {mood === 'surprised' ? (
        <Circle cx="50" cy="76" r="3" fill={colors.ink} />
      ) : (
        <Path d="M44 74q6 5 12 0" stroke={colors.ink} strokeWidth={3} fill="none" strokeLinecap="round" />
      )}
      {!gray && (
        <>
          <Ellipse cx="30" cy="66" rx="5" ry="3" fill={colors.ear} opacity={0.6} />
          <Ellipse cx="70" cy="66" rx="5" ry="3" fill={colors.ear} opacity={0.6} />
        </>
      )}
    </Svg>
  );
}
