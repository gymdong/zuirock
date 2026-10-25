import type { AvatarDto } from '@zuirock/shared';
import { Image, View } from 'react-native';
import { assetUrl } from '../lib/config';
import { colors } from '../theme';
import { Mascot } from './Mascot';

/** Profile photo (social/upload) or the character face. */
export function Avatar({ avatar, size = 64 }: { avatar?: AvatarDto | null; size?: number }) {
  const url = avatar && avatar.source !== 'character' ? avatar.url : null;
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.peach, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}
    >
      {url ? <Image source={{ uri: assetUrl(url)! }} style={{ width: size, height: size }} /> : <FaceCrop size={size} />}
    </View>
  );
}

/** The art is wider than tall; inside a circle it is zoomed onto the face (eyes + nose) so it reads at small sizes. */
function FaceCrop({ size }: { size: number }) {
  const big = size * 1.32;
  const k = big / 855; // body-space → pixels
  // Centre between the ears and the nose so ears, eyes and nose all stay in the circle.
  const faceX = 290 * k;
  const faceY = (big - 764 * k) / 2 + 330 * k;
  return (
    <View style={{ position: 'absolute', left: size / 2 - faceX, top: size / 2 - faceY, width: big, height: big }}>
      <Mascot size={big} blink={false} />
    </View>
  );
}
