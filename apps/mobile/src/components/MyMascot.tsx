import type { WardrobeDto } from '@zuirock/shared';
import { useEffect, useState } from 'react';
import { Api } from '../api/endpoints';
import { useSession } from '../state/session';
import { CharacterLayers } from './CharacterLayers';
import { Mascot, type MascotMotion } from './Mascot';

/** The member's wardrobe, fetched once per user and shared by every MyMascot; the editor refreshes it after saving. */
let cache: { userId: string; data: WardrobeDto } | null = null;
const listeners = new Set<() => void>();

export function setMyWardrobe(userId: string, data: WardrobeDto) {
  cache = { userId, data };
  listeners.forEach((l) => l());
}

function useMyWardrobe(): WardrobeDto | null {
  const userId = useSession().member?.user.id ?? null;
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  useEffect(() => {
    if (!userId || cache?.userId === userId) return;
    let alive = true;
    Api.wardrobe().then(
      (data) => alive && setMyWardrobe(userId, data),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [userId]);
  return userId && cache?.userId === userId ? cache.data : null;
}

/** The user's own (dressed) character; the plain default mouse for guests or while the wardrobe loads. */
export function MyMascot({ size, motion, motionFor }: { size: number; motion?: MascotMotion; motionFor?: number }) {
  const w = useMyWardrobe();
  return w ? <CharacterLayers equipped={w.equipped} items={w.items} size={size} motion={motion} motionFor={motionFor} /> : <Mascot size={size} motion={motion} motionFor={motionFor} />;
}
