import type {
  ChestDto,
  ChestGrantDto,
  ChestReward,
  ConsumableKind,
  ShopItemKind,
  StreakCalendarDto,
  StreakDayState,
  UseSoloItemRequest,
} from '@zuirock/shared';
import { ApiError, type Method } from '../src/api/client';
import { kstDay } from '../src/features/economy/logic';
import { QUESTIONS } from './data';

/** Mock of the round-2 economy API (shop, inventory, chests, streak calendar, solo items). */
export const wallet = { cheese: 320 };
const held: Record<ShopItemKind, number> = { streak_protection: 1, chosung_first: 2, remove_wrong_choice: 1 };
const PRODUCTS: Array<{ kind: ShopItemKind; name: string; desc: string; price: number; max: number }> = [
  { kind: 'streak_protection', name: '연속학습 보호권', desc: '학습을 못 한 날 자동으로 써서 연속을 지켜줘요', price: 50, max: 2 },
  { kind: 'chosung_first', name: '초성 첫 글자 공개권', desc: '솔로 초성퀴즈에서 정답의 첫 글자를 보여줘요', price: 15, max: 99 },
  { kind: 'remove_wrong_choice', name: '오답 보기 제거권', desc: '솔로 객관식에서 오답 보기 하나를 지워줘요', price: 15, max: 99 },
];
let chestSeq = 0;
const chests = new Map<string, ChestDto & { opened: boolean }>();
const usedItems = new Set<string>();

export function grantMockChest(level: number): ChestGrantDto {
  const id = `chest-${++chestSeq}`;
  const tier = level % 5 === 0 ? 'good' : 'normal';
  chests.set(id, { id, tier, source: { topicId: 'general', level }, grantedAt: new Date().toISOString(), opened: false });
  return { id, tier };
}
grantMockChest(10);

/** Mock daily quests: 1/1 stage done, battle not yet, 12/20 correct. */
const questState = { stage: 1, battle: 0, correct: 12 };
const claimedQuests = new Map<string, string>();
const QUEST_DEFS = [
  { id: 'stage', title: '학습 스테이지 1개 완료하기', desc: '스테이지 세트를 한 번 끝까지 풀어요', target: 1 },
  { id: 'battle', title: '멀티 대결 1번 하기', desc: '친구와 대결을 끝까지 플레이해요', target: 1 },
  { id: 'correct', title: '문제 20개 맞히기', desc: '솔로·대결 어디서든 정답 20개', target: 20 },
] as const;
function questChest(id: string) {
  const cid = claimedQuests.get(id);
  const c = cid ? chests.get(cid) : undefined;
  return c ? { id: c.id, tier: c.tier, opened: c.opened } : undefined;
}
function quests() {
  const list = QUEST_DEFS.map((d) => {
    const raw = questState[d.id];
    const chest = questChest(d.id);
    return { ...d, progress: Math.min(raw, d.target), done: raw >= d.target, claimed: !!chest, tier: 'quest' as const, ...(chest ? { chest } : {}) };
  });
  const cleared = list.filter((q) => q.done).length;
  const bchest = questChest('all');
  return {
    kstDay: kstDay(new Date()),
    resetsAt: new Date(Date.now() + 5 * 3_600_000 + 12 * 60_000).toISOString(),
    quests: list,
    bonus: { id: 'all', title: '오늘의 퀘스트 모두 완료', done: cleared === list.length, claimed: !!bchest, tier: 'good' as const, cleared, total: list.length, ...(bchest ? { chest: bchest } : {}) },
    claimable: list.filter((q) => q.done && !q.claimed).length,
  };
}

const inventory = () => ({
  items: (['chosung_first', 'remove_wrong_choice'] as const).map((kind) => ({ kind, owned: held[kind] })),
  chests: [...chests.values()].filter((c) => !c.opened).map(({ opened: _o, ...c }) => c),
});

function calendar(month: string): StreakCalendarDto {
  const today = kstDay(new Date());
  const [y, m] = month.split('-').map(Number) as [number, number];
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = Array.from({ length: count }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    const state: StreakDayState =
      date === today ? 'today' : date > today ? 'future' : i % 9 === 4 ? 'missed' : i % 11 === 6 ? 'protected' : 'studied';
    return { date, state, ...(state === 'studied' ? { sets: 1 + (i % 3), battles: i % 2 } : {}) };
  });
  return { month, days, current: 7, longest: 23, protectionsHeld: held.streak_protection, nextMilestone: { days: 14, cheese: 30, daysLeft: 7 } };
}

function roll(tier: ChestDto['tier']): ChestReward[] {
  if (tier === 'good') return [{ type: 'cheese', amount: 20 + Math.floor(Math.random() * 31) }, { type: 'item', kind: 'chosung_first', quantity: 1 }];
  const r = Math.random();
  return r < 0.7 ? [{ type: 'cheese', amount: 5 + Math.floor(Math.random() * 11) }] : [{ type: 'item', kind: r < 0.9 ? 'chosung_first' : 'remove_wrong_choice', quantity: 1 }];
}

/** Returns undefined when the path is not an economy route. */
export function handleEconomy(method: Method, path: string, body: unknown): unknown {
  if (path.startsWith('/me/streak/calendar')) return calendar(path.split('month=')[1] ?? kstDay(new Date()).slice(0, 7));
  if (path === '/shop') {
    return {
      cheese: wallet.cheese,
      items: PRODUCTS.map((p) => ({ ...p, owned: held[p.kind] })),
      chestsUnopened: inventory().chests.length,
    };
  }
  if (path === '/me/inventory') return inventory();
  if (path === '/me/quests') return quests();
  const claim = /^\/me\/quests\/([a-z]+)\/claim$/.exec(path);
  if (claim && method === 'POST') {
    const id = claim[1]!;
    const q = id === 'all' ? quests().bonus : quests().quests.find((x) => x.id === id);
    if (!q) throw new ApiError(404, 'QUEST_NOT_FOUND', '퀘스트를 찾을 수 없어요');
    if (!q.done) throw new ApiError(409, 'QUEST_NOT_DONE', '아직 완료하지 못한 퀘스트예요');
    if (!claimedQuests.has(id)) {
      const cid = `chest-${++chestSeq}`;
      chests.set(cid, { id: cid, tier: id === 'all' ? 'good' : 'quest', source: null, quest: id, grantedAt: new Date().toISOString(), opened: false });
      claimedQuests.set(id, cid);
    }
    const c = chests.get(claimedQuests.get(id)!)!;
    return { chest: { id: c.id, tier: c.tier, opened: c.opened } };
  }
  const buy = /^\/shop\/items\/([a-z_]+)\/purchase$/.exec(path);
  if (buy && method === 'POST') {
    const p = PRODUCTS.find((x) => x.kind === buy[1]);
    if (!p) throw new ApiError(404, 'NOT_FOUND', '없는 상품이에요');
    const q = (body as { quantity?: number } | undefined)?.quantity ?? 1;
    if (held[p.kind] + q > p.max) throw new ApiError(409, 'MAX_HELD', `최대 ${p.max}개까지 가질 수 있어요`);
    if (p.price * q > wallet.cheese) throw new ApiError(402, 'INSUFFICIENT_CHEESE', '치즈가 부족해요');
    wallet.cheese -= p.price * q;
    held[p.kind] += q;
    return { cheese: wallet.cheese, owned: held[p.kind] };
  }
  const open = /^\/me\/chests\/([^/]+)\/open$/.exec(path);
  if (open && method === 'POST') {
    const c = chests.get(open[1]!);
    if (!c) throw new ApiError(404, 'NOT_FOUND', '상자를 찾을 수 없어요');
    if (c.opened) throw new ApiError(409, 'CHEST_OPENED', '이미 연 상자예요');
    c.opened = true;
    const rewards = roll(c.tier);
    for (const r of rewards) {
      if (r.type === 'cheese') wallet.cheese += r.amount;
      else if (r.type === 'item') held[r.kind] += r.quantity;
      else held.streak_protection += 1;
    }
    return { rewards, cheese: wallet.cheese, inventory: inventory() };
  }
  const use = /^\/solo\/sets\/([^/]+)\/items\/use$/.exec(path);
  if (use && method === 'POST') {
    const { questionId, kind } = body as UseSoloItemRequest;
    const m = QUESTIONS.find((x) => questionId.startsWith(`${x.pub.id}-`));
    if (!m) throw new ApiError(404, 'NOT_FOUND', '문제를 찾을 수 없어요');
    if ((kind === 'chosung_first') !== (m.pub.type === 'chosung') || (kind === 'remove_wrong_choice' && m.pub.type !== 'mcq'))
      throw new ApiError(400, 'WRONG_QUESTION_TYPE', '이 문제에는 쓸 수 없어요');
    if (held[kind as ConsumableKind] <= 0) throw new ApiError(409, 'NO_ITEM', '아이템이 없어요');
    const key = `${use[1]}:${questionId}:${kind}`;
    if (usedItems.has(key)) throw new ApiError(409, 'ALREADY_USED', '이 문제에는 이미 썼어요');
    usedItems.add(key);
    held[kind] -= 1;
    return kind === 'chosung_first'
      ? { chosungFirst: [...m.reveal.answer][0], owned: held[kind] }
      : { removedChoice: (m.pub.choices ?? []).find((c) => c !== m.reveal.answer), owned: held[kind] };
  }
  return undefined;
}
