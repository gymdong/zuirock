/**
 * 아이템 자리표시 PNG(256x256, 투명 배경)와 content/items/items.json 을 만든다.
 *   node scripts/gen-placeholder-items.ts
 * 슬롯마다 4개: 기본 1, 치즈 구매 2(80, 150), Lv.20 해금 1. 실제 그림은 관리자 Items 화면에서 교체한다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZE = 256;
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'items');

type Slot = 'hat' | 'top' | 'bottom' | 'shoes' | 'accessory';
type Acquire = 'default' | 'cheese' | 'level';
interface Def { slot: Slot; key: string; name: string; acquire: Acquire; price: number | null; unlockLevel: number | null; color: [number, number, number] }

const defs: Def[] = [
  ['hat', '모자', [['basic', '기본 모자', 'default', [200, 170, 120]], ['beret', '노란 베레모', 'cheese', [240, 200, 60], 80], ['crown', '치즈 왕관', 'cheese', [250, 180, 30], 150], ['explorer', '탐험가 모자', 'level', [120, 90, 60]]]],
  ['top', '상의', [['basic', '기본 티셔츠', 'default', [250, 250, 250]], ['hoodie', '파란 후드', 'cheese', [70, 120, 220], 80], ['jacket', '체크 재킷', 'cheese', [200, 70, 70], 150], ['hero', '영웅 망토 셔츠', 'level', [130, 60, 180]]]],
  ['bottom', '하의', [['basic', '기본 바지', 'default', [80, 90, 120]], ['shorts', '초록 반바지', 'cheese', [70, 170, 110], 80], ['skirt', '분홍 치마', 'cheese', [240, 130, 170], 150], ['cargo', '카고 바지', 'level', [110, 120, 70]]]],
  ['shoes', '신발', [['basic', '기본 운동화', 'default', [240, 240, 240]], ['boots', '갈색 부츠', 'cheese', [140, 90, 50], 80], ['sneaker', '빨간 스니커즈', 'cheese', [220, 50, 50], 150], ['golden', '황금 신발', 'level', [235, 190, 40]]]],
  ['accessory', '소품', [['basic', '기본 안경', 'default', [60, 60, 60]], ['scarf', '줄무늬 목도리', 'cheese', [230, 90, 90], 80], ['bag', '작은 가방', 'cheese', [90, 150, 210], 150], ['wand', '치즈 지팡이', 'level', [250, 215, 80]]]],
].flatMap(([slot, , list]) =>
  (list as unknown[][]).map((r) => ({
    slot: slot as Slot, key: r[0] as string, name: r[1] as string, acquire: r[2] as Acquire,
    price: (r[4] as number | undefined) ?? null, unlockLevel: r[2] === 'level' ? 20 : null, color: r[3] as [number, number, number],
  })),
);

type Shape = (x: number, y: number) => boolean;
const ellipse = (cx: number, cy: number, rx: number, ry: number): Shape => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const rect = (x0: number, y0: number, x1: number, y1: number): Shape => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const shapes: Record<Slot, Shape[]> = {
  hat: [ellipse(128, 70, 60, 30), rect(50, 85, 206, 100)],
  top: [rect(70, 100, 186, 190), rect(40, 100, 70, 160), rect(186, 100, 216, 160)],
  bottom: [rect(75, 190, 125, 245), rect(131, 190, 181, 245), rect(75, 180, 181, 200)],
  shoes: [ellipse(95, 235, 35, 15), ellipse(161, 235, 35, 15)],
  accessory: [rect(90, 95, 166, 115), ellipse(128, 128, 22, 22)],
};

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(slot: Slot, [r, g, b]: [number, number, number]): Buffer {
  const rows = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const o = y * (SIZE * 4 + 1);
    for (let x = 0; x < SIZE; x++) {
      if (!shapes[slot].some((s) => s(x, y))) continue;
      rows.set([r, g, b, 255], o + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(join(root, 'images'), { recursive: true });
const items = defs.map((d, i) => {
  const id = `${d.slot}-${d.key}`;
  writeFileSync(join(root, 'images', `${id}.png`), png(d.slot, d.color));
  return { id, slot: d.slot, name: d.name, image: `images/${id}.png`, acquire: d.acquire, price: d.price, unlockLevel: d.unlockLevel, sortOrder: i };
});
writeFileSync(join(root, 'items.json'), `${JSON.stringify(items, null, 2)}\n`);
console.log(`${items.length}개 아이템 생성: ${root}`);
