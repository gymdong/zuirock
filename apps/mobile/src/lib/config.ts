import Constants from 'expo-constants';

/**
 * Deployment origin from app.config.ts `extra.publicOrigin` (built from the PUBLIC_ORIGIN env var).
 * Never hardcode the Render host: it is only known from the dashboard.
 */
export const publicOrigin: string = String(
  (Constants.expoConfig?.extra as { publicOrigin?: string } | undefined)?.publicOrigin ?? 'http://localhost:3000',
).replace(/\/$/, '');

export const apiBase = `${publicOrigin}/api`;

/** `EXPO_PUBLIC_API_MOCK=1` runs against the in-app mock (apps/mobile/mock) instead of the server. */
export const useMockApi = process.env.EXPO_PUBLIC_API_MOCK === '1';

export function inviteUrl(code: string): string {
  return `${publicOrigin}/join/${code}`;
}
