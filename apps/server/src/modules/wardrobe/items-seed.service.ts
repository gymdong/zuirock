import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { ItemAcquireKind, ItemSlot } from '@zuirock/shared';
import { PrismaService } from '../../common/prisma.service.js';
import { AssetsService } from '../assets/assets.service.js';

interface ItemJson {
  id: string;
  slot: ItemSlot;
  name: string;
  /** Path relative to items.json, e.g. images/head-basic.png. */
  image: string;
  acquire: ItemAcquireKind;
  price: number | null;
  unlockLevel: number | null;
  sortOrder: number;
}

/** content/items/items.json: ITEMS_JSON env, the repo checkout, or /app/content in the image. */
export function findItemsJson(): string | null {
  const candidates = [
    process.env.ITEMS_JSON,
    resolve(process.cwd(), 'content/items/items.json'),
    resolve(process.cwd(), '../../content/items/items.json'),
    new URL('../../../../../content/items/items.json', import.meta.url).pathname,
    new URL('../../../content/items/items.json', import.meta.url).pathname,
  ].filter((p): p is string => !!p);
  return candidates.find((p) => existsSync(p)) ?? null;
}

/**
 * Items are data (AC-G9): on boot every item in items.json is upserted with its image stored as an Asset, so a deploy
 * ships the catalog without a manual sync. Items missing from the file are left alone.
 */
@Injectable()
export class ItemsSeedService implements OnApplicationBootstrap {
  private readonly log = new Logger('Items');

  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (error) {
      this.log.warn(`item seed skipped: ${(error as Error).message}`);
    }
  }

  async seed(path = findItemsJson()): Promise<number> {
    if (!path) throw new Error('content/items/items.json not found (set ITEMS_JSON)');
    const items = JSON.parse(readFileSync(path, 'utf8')) as ItemJson[];
    for (const it of items) {
      const { key } = await this.assets.put(readFileSync(resolve(dirname(path), it.image)));
      const data = { slot: it.slot, name: it.name, imageKey: key, acquire: it.acquire, price: it.price, unlockLevel: it.unlockLevel, sortOrder: it.sortOrder };
      await this.prisma.item.upsert({ where: { id: it.id }, create: { id: it.id, ...data }, update: data });
    }
    return items.length;
  }
}
