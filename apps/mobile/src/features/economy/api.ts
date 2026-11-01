import type {
  ActivateXpBoostResponse,
  ClaimQuestResponse,
  ConsumableKind,
  DailyQuestsDto,
  InventoryDto,
  OpenChestResponse,
  PurchaseShopItemResponse,
  ShopDto,
  ShopItemKind,
  StreakCalendarDto,
  UseSoloItemResponse,
} from '@zuirock/shared';
import { api } from '../../api/client';
import { session } from '../../state/session';

let seq = 0;
const opKey = (op: string) => `${op}:${Date.now().toString(36)}:${(++seq).toString(36)}`;

/** Shop, inventory, chests, streak calendar and solo items (docs/feedback-round2.md API contract). */
export const EconomyApi = {
  calendar: (month: string) => api<StreakCalendarDto>('GET', `/me/streak/calendar?month=${month}`),
  shop: () => api<ShopDto>('GET', '/shop'),
  /** 일일 퀘스트(KST 하루): 진행도·받을 보상. */
  quests: () => api<DailyQuestsDto>('GET', '/me/quests'),
  /** 보상 받기 = 상자 1개. 두 번 눌러도 같은 상자(서버가 날짜·퀘스트로 한 번만 만든다). */
  claimQuest: (id: string) => api<ClaimQuestResponse>('POST', `/me/quests/${id}/claim`, { idempotencyKey: opKey(`quest:${id}`) }),
  inventory: () => api<InventoryDto>('GET', '/me/inventory'),
  purchase: (kind: ShopItemKind, quantity = 1) =>
    api<PurchaseShopItemResponse>('POST', `/shop/items/${kind}/purchase`, { body: { quantity }, idempotencyKey: opKey(`buy:${kind}`) }),
  // A chest opens once, so its id is a stable idempotency key.
  openChest: (id: string) => api<OpenChestResponse>('POST', `/me/chests/${id}/open`, { idempotencyKey: `chest:${id}` }),
  /** 경험치 부스트 1개를 써서 다음 세트들의 XP를 올린다. 409 NO_ITEM / BOOST_FULL. */
  activateBoost: () => api<ActivateXpBoostResponse>('POST', '/me/boost/activate', { idempotencyKey: opKey('boost') }),
  useItem: (setId: string, questionId: string, kind: ConsumableKind) =>
    api<UseSoloItemResponse>('POST', `/solo/sets/${setId}/items/use`, {
      body: { questionId, kind },
      idempotencyKey: `${setId}:${questionId}:item:${kind}`,
    }),
};

/** Reflect a new cheese balance in the cached profile (home header chip) right away. */
export function setCheese(cheese: number): void {
  const user = session.get().member?.user;
  if (user && user.cheese !== cheese) void session.updateMe({ ...user, cheese });
}
