import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * API origin. The web build is served by the API server itself, so web uses the page origin
 * (no build-time host to get wrong); `EXPO_PUBLIC_API_ORIGIN` overrides it for `expo start --web`.
 * Native builds use app.config.ts `extra.publicOrigin` (from the PUBLIC_ORIGIN env var). Never
 * hardcode the Render host: it is only known from the dashboard.
 */
const configuredOrigin = String(
  (Constants.expoConfig?.extra as { publicOrigin?: string } | undefined)?.publicOrigin ?? 'http://localhost:3000',
);

export const publicOrigin: string = (
  process.env.EXPO_PUBLIC_API_ORIGIN ||
  (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : configuredOrigin)
).replace(/\/$/, '');

export const apiBase = `${publicOrigin}/api`;

/** `EXPO_PUBLIC_API_MOCK=1` runs against the in-app mock (apps/mobile/mock) instead of the server. */
export const useMockApi = process.env.EXPO_PUBLIC_API_MOCK === '1';

export function inviteUrl(code: string): string {
  return `${publicOrigin}/join/${code}`;
}

/** Server asset paths (`/api/assets/:key`) are origin-relative; native needs the full URL. */
export function assetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${publicOrigin}${url}` : url;
}
