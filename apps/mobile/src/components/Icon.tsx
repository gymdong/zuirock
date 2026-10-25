import { Image } from 'react-native';
import CHEESE from '../../assets/character/cheese.png';
import Svg, { Circle, Path, Rect } from 'react-native-svg';


export type IconName =
  | 'home' | 'battle' | 'report' | 'profile' | 'back' | 'close' | 'plus' | 'code' | 'link'
  | 'lock' | 'check' | 'flame' | 'cheese' | 'sparkle' | 'star';

/** Line icons drawn for the mockup (stroke 2.2, round caps). */
export function Icon({ name, size = 24, color = '#241B4D', filled }: { name: IconName; size?: number; color?: string; filled?: boolean }) {
  // Cheese is the designer's artwork (174×154), drawn at the icon's width.
  if (name === 'cheese') return <Image source={CHEESE} style={{ width: size, height: size * (154 / 174) }} resizeMode="contain" />;
  const p = { stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && <Path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" {...p} />}
      {name === 'battle' && (
        <>
          <Path d="M5 5l14 14M19 5 5 19" {...p} />
          <Path d="M4 8l4-4M16 20l4-4" {...p} />
        </>
      )}
      {name === 'report' && <Path d="M6 20v-7M12 20V5M18 20v-10" {...p} />}
      {name === 'profile' && (
        <>
          <Circle cx="12" cy="8" r="4" {...p} />
          <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" {...p} />
        </>
      )}
      {name === 'back' && <Path d="M15 5l-7 7 7 7" {...p} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6 6 18" {...p} />}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...p} />}
      {name === 'code' && (
        <>
          <Rect x="3" y="6" width="18" height="12" rx="4" {...p} />
          <Path d="M8 12h.01M12 12h.01M16 12h.01" {...p} strokeWidth={3} />
        </>
      )}
      {name === 'link' && <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" {...p} />}
      {name === 'lock' && (
        <>
          <Rect x="6" y="11" width="12" height="9" rx="2" {...p} />
          <Path d="M9 11V8a3 3 0 0 1 6 0v3" {...p} />
        </>
      )}
      {name === 'check' && <Path d="M5 12l5 5 9-10" {...p} />}
      {name === 'flame' && <Path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 2 1 3 3 3 3s1-3 0-7z" fill={color} stroke="none" />}
      {name === 'sparkle' && <Path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" {...p} />}
      {name === 'star' && (
        <Path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      )}
    </Svg>
  );
}
