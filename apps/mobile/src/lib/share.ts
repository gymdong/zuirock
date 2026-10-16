import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';

/** Share an invite link: native share sheet, Web Share API, else copy. Returns 'copied' when copied. */
export async function shareLink(url: string, message: string): Promise<'shared' | 'copied'> {
  if (Platform.OS !== 'web') {
    await Share.share({ message: `${message}\n${url}` });
    return 'shared';
  }
  const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ text: message, url });
      return 'shared';
    } catch {
      // Cancelled or blocked: fall back to copying.
    }
  }
  await Clipboard.setStringAsync(url);
  return 'copied';
}
