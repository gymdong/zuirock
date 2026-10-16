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
      {url ? <Image source={{ uri: assetUrl(url)! }} style={{ width: size, height: size }} /> : <Mascot size={size * 0.86} />}
    </View>
  );
}
