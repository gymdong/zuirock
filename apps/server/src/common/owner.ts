import type { OwnerRef } from '@zuirock/shared';

/** Prisma filter / data for an owner of a source row (exactly one of userId / guestId). */
export function ownerWhere(owner: OwnerRef): { userId: string } | { guestId: string } {
  return owner.kind === 'user' ? { userId: owner.userId } : { guestId: owner.guestId };
}

export function ownerId(owner: OwnerRef): string {
  return owner.kind === 'user' ? owner.userId : owner.guestId;
}
