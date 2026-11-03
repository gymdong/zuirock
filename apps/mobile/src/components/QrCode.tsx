import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

const QUIET = 4; // QR 규격의 여백(모듈 4칸) — 카메라가 읽으려면 필요하다

/** 순수 JS QR(네이티브 모듈 없음). 흰 바탕에 짙은 색, 오류 정정 M. */
export function QrCode({ value, size = 260 }: { value: string; size?: number }) {
  const { count, d } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        if (qr.isDark(r, c)) path += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
      }
    }
    return { count: n, d: path };
  }, [value]);
  const total = count + QUIET * 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${total} ${total}`} accessibilityLabel="방 입장 QR 코드">
      <Rect x={0} y={0} width={total} height={total} fill="#FFFFFF" />
      <Path d={d} fill={colors.ink} />
    </Svg>
  );
}
