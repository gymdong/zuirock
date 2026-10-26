import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { colors } from '../../theme';

/** A round cheese with holes and a darker rind — the stage the mascot stands on (치즈 마을). */
export function CheeseWheel({ size = 200 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.62} viewBox="0 0 200 124">
      {/* rind (side) */}
      <Path d="M8 54 V78 C8 104 192 104 192 78 V54 Z" fill={colors.crust} />
      {/* top face */}
      <Ellipse cx={100} cy={54} rx={92} ry={36} fill={colors.cheese} />
      <Ellipse cx={100} cy={54} rx={92} ry={36} fill="none" stroke={colors.cheeseDark} strokeWidth={3} />
      {/* holes */}
      <Ellipse cx={52} cy={48} rx={11} ry={6} fill={colors.cheeseDark} opacity={0.55} />
      <Ellipse cx={140} cy={62} rx={14} ry={7} fill={colors.cheeseDark} opacity={0.55} />
      <Ellipse cx={104} cy={36} rx={7} ry={4} fill={colors.cheeseDark} opacity={0.55} />
      <Ellipse cx={80} cy={70} rx={6} ry={3.5} fill={colors.cheeseDark} opacity={0.55} />
      <Circle cx={30} cy={84} r={5} fill={colors.cheeseDark} opacity={0.6} />
      <Circle cx={168} cy={88} r={6} fill={colors.cheeseDark} opacity={0.6} />
      <Circle cx={110} cy={92} r={4} fill={colors.cheeseDark} opacity={0.6} />
    </Svg>
  );
}
