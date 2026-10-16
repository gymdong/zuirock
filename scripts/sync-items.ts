// Uploads content/items/images/* to the Asset table and upserts the Item rows from content/items/items.json,
// through the real AssetsService. Also uploads the character body image (content/items/images/body.png, or a generated
// placeholder when absent) and prints its key: set it as CHARACTER_BODY_ASSET_KEY in Render's Environment screen.
//   node --env-file=.env scripts/sync-items.ts          (needs a built server and DATABASE_URL/REDIS_URL)
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

const root = resolve(import.meta.dirname, '../content/items');
const dist = resolve(import.meta.dirname, '../apps/server/dist');
const load = async (rel: string) => import(pathToFileURL(resolve(dist, rel)).href);

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** 256x256 solid-colour PNG: stand-in until the real character art lands as content/items/images/body.png. */
function placeholderBody(): Buffer {
  const w = 256;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [255, 224, 130, 255]).flat())]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: w }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const { AppModule } = await load('app.module.js');
const { PrismaService } = await load('common/prisma.service.js');
const { AssetsService } = await load('modules/assets/assets.service.js');
const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
await app.init();
const prisma = app.get(PrismaService, { strict: false }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const assets = app.get(AssetsService, { strict: false }) as { put(b: Buffer): Promise<{ key: string }> };

const items = JSON.parse(readFileSync(resolve(root, 'items.json'), 'utf8')) as {
  id: string; slot: string; name: string; image: string; acquire: string; price: number | null; unlockLevel: number | null; sortOrder: number;
}[];
for (const it of items) {
  const { key } = await assets.put(readFileSync(resolve(root, it.image)));
  const data = { slot: it.slot, name: it.name, imageKey: key, acquire: it.acquire, price: it.price, unlockLevel: it.unlockLevel, sortOrder: it.sortOrder };
  await prisma.item.upsert({ where: { id: it.id }, create: { id: it.id, ...data }, update: data });
}
const bodyPath = resolve(root, 'images/body.png');
const body = await assets.put(existsSync(bodyPath) ? readFileSync(bodyPath) : placeholderBody());
console.log(`[sync-items] ${items.length} items synced`);
console.log(`CHARACTER_BODY_ASSET_KEY=${body.key}`);
await app.close();
