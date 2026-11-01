import { execSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findItemsJson, ItemsSeedService } from '../../src/modules/wardrobe/items-seed.service.js';
import { createTestApp, makeUser, type TestApp } from '../support/app.js';

const SERVER = new URL('../..', import.meta.url).pathname;
const MIGRATION = '20261102100000_character_slots';

describe('character slots: head/eyes/nose/shoes/tail', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('boot seeder upserts items.json with images as assets, idempotently (5 slots × default 1 + cheese 80/150 + Lv.20)', async () => {
    const seeder = t.app.get(ItemsSeedService);
    expect(findItemsJson()).toMatch(/content\/items\/items\.json$/);
    expect(await seeder.seed()).toBe(20);
    const assets = await t.prisma.asset.count();
    await t.prisma.item.update({ where: { id: 'head-pink' }, data: { name: '바뀜', price: 1 } });
    expect(await seeder.seed()).toBe(20);
    expect(await t.prisma.asset.count()).toBe(assets);

    const items = await t.prisma.item.findMany({ orderBy: { sortOrder: 'asc' }, include: { image: true } });
    expect(items).toHaveLength(20);
    for (const slot of ['head', 'eyes', 'nose', 'shoes', 'tail'] as const) {
      const of = items.filter((i) => i.slot === slot);
      expect(of.map((i) => [i.acquire, i.price, i.unlockLevel])).toEqual([
        ['default', null, null],
        ['cheese', 80, null],
        ['cheese', 150, null],
        ['level', null, 20],
      ]);
    }
    expect(items.find((i) => i.id === 'head-pink')).toMatchObject({ name: '분홍 리본', price: 80 });
    // Default eyes/nose are the mascot's own art, byte for byte.
    const eyes = items.find((i) => i.id === 'eyes-basic')!;
    expect(Buffer.from(eyes.image.bytes).equals(readFileSync(new URL('../../../mobile/assets/character/eyes.png', import.meta.url)))).toBe(true);
    expect(eyes.image.contentType).toBe('image/png');

    const u = await makeUser(t);
    const w = await t.http().get('/api/me/wardrobe').set('Authorization', u.auth).expect(200);
    expect(w.body.items.filter((i: { owned: boolean }) => i.owned).map((i: { id: string }) => i.id)).toEqual([
      'head-basic',
      'eyes-basic',
      'nose-basic',
      'shoes-basic',
      'tail-basic',
    ]);
    const on = await t.http().put('/api/me/wardrobe/equipped').set('Authorization', u.auth).send({ equipped: { eyes: 'eyes-basic', tail: 'tail-basic' } }).expect(200);
    expect(on.body.equipped).toEqual({ eyes: 'eyes-basic', tail: 'tail-basic' });
    const bad = await t.http().put('/api/me/wardrobe/equipped').set('Authorization', u.auth).send({ equipped: { hat: 'head-basic' } }).expect(400);
    expect(bad.body.code).toBe('BAD_SLOT');
    await t.http().put('/api/me/wardrobe/equipped').set('Authorization', u.auth).send({ equipped: { nose: 'eyes-basic' } }).expect(400);
  });

  it(`migration ${MIGRATION}: refunds cheese-bought old items, clears old equips/items, keeps shoes`, async () => {
    const base = process.env.DATABASE_URL!;
    const name = /\/(zuirock_test_[a-z0-9_]+)(\?|$)/.exec(base)![1]!;
    const scratch = `${name}_mig`;
    const url = base.replace(`/${name}`, `/${scratch}`);
    const admin = new PrismaClient({ datasourceUrl: base.replace(`/${name}`, '/postgres') });
    const dir = mkdtempSync(join(tmpdir(), 'zr-mig-'));
    const db = new PrismaClient({ datasourceUrl: url });
    const deploy = () => execSync(`npx prisma migrate deploy --schema ${join(dir, 'schema.prisma')}`, { cwd: SERVER, stdio: 'pipe', env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });
    try {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`);
      await admin.$executeRawUnsafe(`CREATE DATABASE "${scratch}"`);
      cpSync(join(SERVER, 'prisma'), dir, { recursive: true, filter: (src) => !src.includes(MIGRATION) });
      deploy();

      // Old-style data: hat/top/accessory items next to a shoes item that survives.
      const a = await db.user.create({ data: { nickname: '구슬롯A' } });
      const b = await db.user.create({ data: { nickname: '구슬롯B' } });
      await db.$executeRawUnsafe(`INSERT INTO "Asset" ("key", "contentType", "size", "bytes") VALUES ('k', 'image/png', 1, '\\x00')`);
      await db.$executeRawUnsafe(`INSERT INTO "Item" ("id", "slot", "name", "imageKey", "acquire", "price", "unlockLevel", "sortOrder") VALUES
        ('hat-basic', 'hat', '기본 모자', 'k', 'default', NULL, NULL, 0),
        ('hat-beret', 'hat', '베레모', 'k', 'cheese', 80, NULL, 1),
        ('top-jacket', 'top', '재킷', 'k', 'cheese', 150, NULL, 2),
        ('accessory-wand', 'accessory', '지팡이', 'k', 'level', NULL, 20, 3),
        ('shoes-boots', 'shoes', '부츠', 'k', 'cheese', 80, NULL, 4)`);
      const ledger = (userId: string, delta: number, reason: string, itemId: string | null) =>
        db.$executeRawUnsafe(`INSERT INTO "CheeseLedger" ("id", "userId", "delta", "reason", "itemId") VALUES (gen_random_uuid(), $1::uuid, $2, $3::"CheeseReason", $4)`, userId, delta, reason, itemId);
      const own = (userId: string, itemId: string) => db.$executeRawUnsafe(`INSERT INTO "UserItem" ("userId", "itemId") VALUES ($1::uuid, $2)`, userId, itemId);
      await ledger(a.id, 1000, 'seed_adjust', null);
      for (const [item, price] of [['hat-beret', 80], ['top-jacket', 150], ['shoes-boots', 80]] as const) {
        await ledger(a.id, -price, 'item_purchase', item);
        await own(a.id, item);
      }
      await own(a.id, 'hat-basic');
      await own(a.id, 'accessory-wand');
      await db.$executeRawUnsafe(`INSERT INTO "CharacterEquip" ("userId", "slot", "itemId") VALUES ($1::uuid, 'hat', 'hat-beret'), ($1::uuid, 'top', 'top-jacket'), ($1::uuid, 'shoes', 'shoes-boots')`, a.id);
      // B: hat-beret owned without a purchase row (list price refunded), top-jacket bought at an older price of 120.
      await ledger(b.id, 500, 'seed_adjust', null);
      await own(b.id, 'hat-beret');
      await ledger(b.id, -120, 'item_purchase', 'top-jacket');
      await own(b.id, 'top-jacket');
      await db.$executeRawUnsafe(`INSERT INTO "CharacterEquip" ("userId", "slot", "itemId") VALUES ($1::uuid, 'accessory', 'accessory-wand')`, b.id);

      cpSync(join(SERVER, 'prisma/migrations', MIGRATION), join(dir, 'migrations', MIGRATION), { recursive: true });
      deploy();

      const refunds = await db.cheeseLedger.findMany({ where: { reason: 'seed_adjust', itemId: { not: null } }, orderBy: [{ userId: 'asc' }, { itemId: 'asc' }] });
      expect(refunds.map((r) => [r.userId === a.id ? 'A' : 'B', r.itemId, r.delta]).sort()).toEqual([
        ['A', 'hat-beret', 80],
        ['A', 'top-jacket', 150],
        ['B', 'hat-beret', 80],
        ['B', 'top-jacket', 120],
      ]);
      const balance = async (userId: string) => (await db.cheeseLedger.aggregate({ where: { userId }, _sum: { delta: true } }))._sum.delta;
      expect(await balance(a.id)).toBe(1000 - 80); // only the shoes stay paid for
      expect(await balance(b.id)).toBe(500 + 80);
      expect((await db.item.findMany()).map((i) => i.id)).toEqual(['shoes-boots']);
      expect(await db.userItem.findMany({ select: { userId: true, itemId: true } })).toEqual([{ userId: a.id, itemId: 'shoes-boots' }]);
      expect(await db.characterEquip.findMany()).toEqual([{ userId: a.id, slot: 'shoes', itemId: 'shoes-boots' }]);
      expect(await db.asset.count()).toBe(1);
      const values = await db.$queryRawUnsafe<Array<{ v: string }>>(`SELECT unnest(enum_range(NULL::"ItemSlot"))::text AS v`);
      expect(values.map((r) => r.v)).toEqual(['head', 'eyes', 'nose', 'shoes', 'tail']);
      expect(await db.$queryRawUnsafe(`SELECT 1 FROM pg_type WHERE typname = 'ItemSlot_old'`)).toEqual([]);
    } finally {
      await db.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`);
      await admin.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
