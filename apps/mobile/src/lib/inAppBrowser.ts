/**
 * In-app browser detection and escape for invite links (AC-A8). OAuth and web storage are
 * unreliable inside messenger webviews, so the join landing sends the user to the system browser.
 */
export type InAppBrowser = 'kakaotalk' | 'naver' | 'instagram' | 'facebook' | 'line' | 'band' | 'webview';
export type OsFamily = 'android' | 'ios' | 'other';

export function detectOs(ua: string): OsFamily {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'other';
}

export function detectInAppBrowser(ua: string): InAppBrowser | null {
  if (/KAKAOTALK/i.test(ua)) return 'kakaotalk';
  if (/NAVER\(inapp/i.test(ua)) return 'naver';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  if (/\bLine\//i.test(ua)) return 'line';
  if (/BAND\//i.test(ua)) return 'band';
  // Generic Android WebView ("; wv)") — not Chrome Custom Tabs.
  if (/Android.*;\s*wv\)/i.test(ua)) return 'webview';
  return null;
}

export type EscapePlan =
  | { kind: 'none' }
  /** Navigate to `href` to reopen `url` in the external browser. */
  | { kind: 'redirect'; href: string }
  /** No reliable programmatic escape (e.g. iOS non-Kakao webviews): show the help screen. */
  | { kind: 'help'; app: InAppBrowser; os: OsFamily };

/**
 * - KakaoTalk (both OSes): `kakaotalk://web/openExternal?url=…`.
 * - Other Android webviews: an `intent://` URL WITHOUT `package=` so Android picks the default
 *   browser, with `S.browser_fallback_url` for when no handler resolves.
 * - Anything else: help screen ("…에서 브라우저로 열기").
 */
export function planEscape(url: string, ua: string): EscapePlan {
  const app = detectInAppBrowser(ua);
  if (!app) return { kind: 'none' };
  const os = detectOs(ua);
  if (app === 'kakaotalk') {
    return { kind: 'redirect', href: `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}` };
  }
  if (os === 'android') return { kind: 'redirect', href: androidIntentUrl(url) };
  return { kind: 'help', app, os };
}

export function androidIntentUrl(url: string): string {
  const u = new URL(url);
  const scheme = u.protocol.replace(':', '');
  return (
    `intent://${u.host}${u.pathname}${u.search}${u.hash}` +
    `#Intent;scheme=${scheme};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;` +
    `S.browser_fallback_url=${encodeURIComponent(url)};end`
  );
}

export const IN_APP_NAMES: Record<InAppBrowser, string> = {
  kakaotalk: '카카오톡',
  naver: '네이버 앱',
  instagram: '인스타그램',
  facebook: '페이스북',
  line: '라인',
  band: '밴드',
  webview: '앱 내 브라우저',
};
