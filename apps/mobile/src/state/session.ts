import type { AuthSession, GuestSession, MeDto } from '@zuirock/shared';
import { useSyncExternalStore } from 'react';
import { storage } from '../lib/storage';

const MEMBER_KEY = 'zuirock.session';
const GUEST_KEY = 'zuirock.guest';

export interface SessionState {
  loaded: boolean;
  member: AuthSession | null;
  /** Kept after login until the server confirms the merge (AuthSession.merge). */
  guest: GuestSession | null;
}

let state: SessionState = { loaded: false, member: null, guest: null };
const listeners = new Set<() => void>();

function set(next: Partial<SessionState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function expired(iso: string | undefined): boolean {
  return !!iso && Date.parse(iso) <= Date.now();
}

export const session = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  async load() {
    if (state.loaded) return;
    const [member, guest] = await Promise.all([
      storage.get<AuthSession>(MEMBER_KEY),
      storage.get<GuestSession>(GUEST_KEY),
    ]);
    set({
      loaded: true,
      member: member && !expired(member.expiresAt) ? member : null,
      guest: guest && !expired(guest.expiresAt) ? guest : null,
    });
  },
  /** Bearer token for REST and the socket handshake: member JWT, else guest token. */
  token(): string | null {
    return state.member?.accessToken ?? state.guest?.guestToken ?? null;
  },
  async setMember(s: AuthSession) {
    set({ member: s });
    await storage.set(MEMBER_KEY, s);
    if (s.merge) await session.clearGuest();
  },
  async updateMe(user: MeDto) {
    if (!state.member) return;
    const member = { ...state.member, user };
    set({ member });
    await storage.set(MEMBER_KEY, member);
  },
  async setGuest(g: GuestSession) {
    set({ guest: g });
    await storage.set(GUEST_KEY, g);
  },
  async clearGuest() {
    set({ guest: null });
    await storage.remove(GUEST_KEY);
  },
  async logout() {
    set({ member: null });
    await storage.remove(MEMBER_KEY);
  },
};

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}
