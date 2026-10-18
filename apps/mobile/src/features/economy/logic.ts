import type { ChestReward, ShopItemDto, ShopItemKind, StreakCalendarDto, StreakDayState } from '@zuirock/shared';

const KST_OFFSET_MS = 9 * 3600_000;

/** `YYYY-MM-DD` of `now` in KST. */
export function kstDay(now: Date): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function kstMonth(now: Date): string {
  return kstDay(now).slice(0, 7);
}

/** `YYYY-MM` shifted by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export interface CalendarCell {
  date: string;
  day: number;
  state: StreakDayState;
}

/**
 * Sunday-first week rows for `month`; null pads the first/last week. Days missing from the server
 * response fall back to today/future/missed relative to `today` (KST `YYYY-MM-DD`).
 */
export function monthGrid(month: string, days: StreakCalendarDto['days'], today: string): Array<Array<CalendarCell | null>> {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDate = new Map(days.map((d) => [d.date, d.state]));
  const cells: Array<CalendarCell | null> = Array.from({ length: first }, () => null);
  for (let d = 1; d <= count; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const fallback: StreakDayState = date === today ? 'today' : date > today ? 'future' : 'missed';
    cells.push({ date, day: d, state: byDate.get(date) ?? fallback });
  }
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export type BuyCheck = { ok: true; cost: number } | { ok: false; reason: 'cheese'; shortfall: number } | { ok: false; reason: 'max' };

/** Client-side pre-check mirroring the server's 402 INSUFFICIENT_CHEESE / 409 MAX_HELD. */
export function checkPurchase(item: Pick<ShopItemDto, 'price' | 'owned' | 'max'>, cheese: number, quantity = 1): BuyCheck {
  if (item.owned + quantity > item.max) return { ok: false, reason: 'max' };
  const cost = item.price * quantity;
  if (cost > cheese) return { ok: false, reason: 'cheese', shortfall: cost - cheese };
  return { ok: true, cost };
}

export const ITEM_LABEL: Record<ShopItemKind, string> = {
  streak_protection: '연속학습 보호권',
  chosung_first: '초성 첫 글자 공개권',
  remove_wrong_choice: '오답 보기 제거권',
};

export function rewardLabel(r: ChestReward): string {
  if (r.type === 'cheese') return `치즈 ${r.amount}`;
  if (r.type === 'protection') return ITEM_LABEL.streak_protection;
  return `${ITEM_LABEL[r.kind]}${r.quantity > 1 ? ` ×${r.quantity}` : ''}`;
}

/** Chosung boxes with the first box replaced by the revealed syllable (chosung_first item). */
export function withFirstChar(chosung: string | null, first: string | null | undefined): string | null {
  if (!first) return chosung;
  const letters = [...(chosung ?? '')].filter((c) => c.trim() !== '');
  letters[0] = first;
  return letters.join('');
}
