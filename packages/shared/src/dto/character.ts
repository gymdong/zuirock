import type { ItemAcquireKind, ItemSlot } from '../enums.js';
import type { EquippedItems } from './users.js';

/** Item master data; image swaps need no code change (AC-G9). */
export interface ItemDto {
  id: string;
  slot: ItemSlot;
  name: string;
  imageUrl: string;
  acquire: ItemAcquireKind;
  /** acquire = cheese (80 / 150). */
  price: number | null;
  /** acquire = level (Lv.20). */
  unlockLevel: number | null;
  sortOrder: number;
}

/** GET /api/me/wardrobe (p15) */
export interface WardrobeDto {
  bodyImageUrl: string;
  items: Array<ItemDto & { owned: boolean }>;
  equipped: EquippedItems;
  cheese: number;
}

/** PUT /api/me/wardrobe/equipped — only owned items; unowned can only be previewed client-side. */
export interface EquipRequest {
  equipped: EquippedItems;
}

/** POST /api/me/wardrobe/items/:itemId/purchase */
export interface PurchaseItemResponse {
  itemId: string;
  cheese: number;
}
