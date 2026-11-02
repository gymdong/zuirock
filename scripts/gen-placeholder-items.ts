/**
 * 아이템 자리표시 PNG(투명 배경)와 content/items/items.json 을 만든다.
 *   node scripts/gen-placeholder-items.ts
 * 부위(머리·눈·코·신발·꼬리)마다 4개: 기본 1, 치즈 구매 2(80, 150), Lv.20 해금 1.
 *
 * 그림 규칙(진짜 그림으로 바꿀 때도 같다): content/items/images/<부위>-<이름>.png 는 캐릭터 몸(body.png, 855×764)
 * 위의 부위 상자(BOX, apps/mobile/src/components/CharacterLayers.tsx 의 PLACEMENT 와 같은 값)에 그대로 얹힌다.
 * 그림의 가로:세로 비율을 상자와 맞추면(크기는 2배 등 자유) 위치가 정확히 맞는다.
 * 기본 눈·코는 지금 마스코트 그림(apps/mobile/assets/character/eyes.png, nose.png)을 그대로 쓰고, 기본 꼬리는
 * body.png 에서 잘라 낸다. 꼬리를 바꿔 끼울 수 있게 꼬리를 지운 몸(body-notail.png)도 여기서 만든다.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(repo, 'content', 'items');
const art = join(repo, 'apps', 'mobile', 'assets', 'character');

type Slot = 'head' | 'eyes' | 'nose' | 'shoes' | 'tail';
type Acquire = 'default' | 'cheese' | 'level';
type Rgb = [number, number, number];
type Shape = (x: number, y: number) => boolean;
/** Layers in box units (body.png pixels); later layers paint over earlier ones. */
type Layers = Array<[Shape, Rgb]>;

/** [x, y, w, h] in body.png coordinates. */
const BOX: Record<Slot, [number, number, number, number]> = {
  head: [250, 35, 220, 150],
  eyes: [92, 285, 298, 225],
  nose: [196, 487, 76, 61],
  shoes: [85, 650, 285, 114],
  tail: [640, 480, 215, 160],
};
const SCALE = 2; // drawn art is 2× the box for crisp edges

const ellipse = (cx: number, cy: number, rx: number, ry: number): Shape => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const rect = (x0: number, y0: number, x1: number, y1: number): Shape => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const and = (a: Shape, b: Shape): Shape => (x, y) => a(x, y) && b(x, y);
const polygon = (pts: Array<[number, number]>): Shape => (x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
/** Thick polyline (round caps). */
const stroke = (pts: Array<[number, number]>, width: number): Shape => (x, y) =>
  pts.slice(1).some(([x1, y1], i) => {
    const [x0, y0] = pts[i]!;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
    return (x - x0 - t * dx) ** 2 + (y - y0 - t * dy) ** 2 <= (width / 2) ** 2;
  });
const heart = (cx: number, cy: number, r: number): Shape => (x, y) => {
  const u = (x - cx) / r;
  const v = -(y - cy) / r;
  return (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0;
};
const star = (cx: number, cy: number, r: number): Shape =>
  polygon(Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? r * 0.45 : r;
    return [cx + k * Math.cos(a), cy + k * Math.sin(a)] as [number, number];
  }));
const bow = (cx: number, cy: number, w: number, h: number): Shape => (x, y) =>
  polygon([[cx, cy], [cx - w, cy - h], [cx - w, cy + h]])(x, y) || polygon([[cx, cy], [cx + w, cy - h], [cx + w, cy + h]])(x, y) || ellipse(cx, cy, w * 0.22, h * 0.45)(x, y);

const INK: Rgb = [42, 31, 92];
const WHITE: Rgb = [245, 245, 245];
const PURPLE: Rgb = [106, 92, 196];
const CHEESE: Rgb = [250, 200, 50];
const CHEESE_DARK: Rgb = [214, 160, 30];
const PINK: Rgb = [245, 130, 180];

// Eyes in the eyes box: whites and pupils at the same spots as the mascot's eyes.png.
const whites: Layers = [[ellipse(71, 112, 70, 111), WHITE], [ellipse(227, 112, 70, 111), WHITE]];
// The mascot's tail, as a polyline in the tail box.
const TAIL: Array<[number, number]> = [[30, 115], [70, 112], [110, 92], [140, 70], [165, 62], [185, 70], [198, 84]];
const shoe = (color: Rgb, sole: Rgb): Layers => [
  [ellipse(72, 48, 70, 37), color],
  [ellipse(210, 84, 72, 30), color],
  [and(ellipse(72, 48, 70, 37), rect(0, 72, 285, 114)), sole],
  [and(ellipse(210, 84, 72, 30), rect(0, 103, 285, 114)), sole],
];

type Def = [key: string, name: string, acquire: Acquire, art: Layers | string, price?: number];
const SLOTS: Array<[Slot, Def[]]> = [
  ['head', [
    ['basic', '기본 머리핀', 'default', [[stroke([[70, 112], [150, 92]], 16), CHEESE], [ellipse(150, 92, 14, 14), CHEESE_DARK]]],
    ['pink', '분홍 리본', 'cheese', [[bow(110, 95, 70, 42), PINK], [ellipse(110, 95, 16, 19), [220, 90, 150]]], 80],
    ['yellow', '노란 리본', 'cheese', [[bow(110, 95, 70, 42), CHEESE], [ellipse(110, 95, 16, 19), CHEESE_DARK]], 150],
    ['crown', '치즈 왕관', 'level', [[polygon([[12, 143], [0, 25], [58, 77], [107, 0], [156, 77], [214, 25], [202, 143]]), CHEESE], [rect(12, 118, 202, 143), CHEESE_DARK], [ellipse(107, 95, 12, 12), [230, 80, 80]]]],
  ]],
  ['eyes', [
    ['basic', '기본 눈', 'default', 'eyes.png'],
    ['sparkle', '반짝이는 눈', 'cheese', [...whites, [ellipse(59, 145, 54, 66), INK], [ellipse(215, 145, 54, 66), INK], [ellipse(42, 120, 16, 16), WHITE], [ellipse(198, 120, 16, 16), WHITE], [ellipse(72, 168, 8, 8), WHITE], [ellipse(228, 168, 8, 8), WHITE]], 80],
    ['smile', '웃는 눈', 'cheese', [[stroke([[15, 150], [40, 118], [71, 106], [102, 118], [127, 150]], 24), INK], [stroke([[171, 150], [196, 118], [227, 106], [258, 118], [283, 150]], 24), INK]], 150],
    ['heart', '하트 눈', 'level', [...whites, [heart(62, 140, 46), [230, 60, 90]], [heart(218, 140, 46), [230, 60, 90]]]],
  ]],
  ['nose', [
    ['basic', '기본 코', 'default', 'nose.png'],
    ['round', '동그란 코', 'cheese', [[ellipse(38, 30, 26, 22), [240, 140, 170]], [ellipse(30, 22, 7, 6), [255, 210, 225]]], 80],
    ['heart', '하트 코', 'cheese', [[heart(38, 30, 26), [230, 70, 110]]], 150],
    ['cheese', '치즈 코', 'level', [[polygon([[6, 10], [70, 10], [38, 58]]), CHEESE], [ellipse(26, 20, 6, 6), CHEESE_DARK], [ellipse(46, 26, 5, 5), CHEESE_DARK], [ellipse(38, 40, 4, 4), CHEESE_DARK]]],
  ]],
  ['shoes', [
    ['basic', '기본 운동화', 'default', shoe([240, 240, 240], [190, 190, 200])],
    ['boots', '갈색 부츠', 'cheese', shoe([140, 90, 50], [90, 55, 30]), 80],
    ['sneaker', '빨간 스니커즈', 'cheese', shoe([220, 50, 50], [250, 250, 250]), 150],
    ['golden', '황금 신발', 'level', shoe([235, 190, 40], [190, 140, 20])],
  ]],
  ['tail', [
    ['basic', '기본 꼬리', 'default', 'body.png'],
    ['ribbon', '리본 꼬리', 'cheese', [[stroke(TAIL, 30), PURPLE], [bow(128, 80, 32, 22), PINK], [ellipse(128, 80, 8, 10), [220, 90, 150]]], 80],
    ['bolt', '번개 꼬리', 'cheese', [[stroke([[20, 118], [80, 80], [100, 118], [160, 50], [180, 85], [208, 24]], 22), CHEESE]], 150],
    ['star', '별 꼬리', 'level', [[stroke(TAIL, 30), PURPLE], [star(188, 80, 26), CHEESE]]],
  ]],
];

// ---------- PNG ----------
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

interface Rgba { w: number; h: number; px: Buffer }
function encode({ w, h, px }: Rgba): Buffer {
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
/** Decodes an 8-bit RGBA, non-interlaced PNG (the Figma exports). */
function decode(file: Buffer): Rgba {
  let o = 8;
  let w = 0;
  let h = 0;
  const idat: Buffer[] = [];
  while (o < file.length) {
    const len = file.readUInt32BE(o);
    const type = file.toString('ascii', o + 4, o + 8);
    const data = file.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error('only 8-bit RGBA non-interlaced PNG');
    }
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4);
  const stride = w * 4;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const v = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= 4 ? px[y * stride + i - 4]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + i]! : 0;
      const c = i >= 4 && y > 0 ? px[(y - 1) * stride + i - 4]! : 0;
      const p = a + b - c;
      const pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      px[y * stride + i] = (v + [0, a, b, (a + b) >> 1, pr][f]!) & 0xff;
    }
  }
  return { w, h, px };
}

/** Rasterizes layers at SCALE with 4×4 supersampling. */
function draw(slot: Slot, layers: Layers): Rgba {
  const [, , bw, bh] = BOX[slot];
  const w = bw * SCALE;
  const h = bh * SCALE;
  const px = Buffer.alloc(w * h * 4);
  const N = 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const ux = (x + (sx + 0.5) / N) / SCALE;
          const uy = (y + (sy + 0.5) / N) / SCALE;
          for (let i = layers.length - 1; i >= 0; i--) {
            const [shape, rgb] = layers[i]!;
            if (!shape(ux, uy)) continue;
            r += rgb[0]; g += rgb[1]; b += rgb[2]; n++;
            break;
          }
        }
      }
      if (!n) continue;
      px.set([Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round((255 * n) / (N * N))], (y * w + x) * 4);
    }
  }
  return { w, h, px };
}

/**
 * Splits body.png into the default tail (pixels of the tail box outside the body oval, plus a thin rim inside it so
 * the join stays seamless when the tail is drawn under the body) and body-notail.png (the tail cleared).
 */
function splitTail(): { tail: Rgba; body: Rgba } {
  const body = decode(readFileSync(join(art, 'body.png')));
  const [bx, by, bw, bh] = BOX.tail;
  const oval = (x: number, y: number) => ((x - 359.5) / 360) ** 2 + ((y - 430) / 299) ** 2;
  const tail = { w: bw, h: bh, px: Buffer.alloc(bw * bh * 4) };
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      const i = (y * body.w + x) * 4;
      if (oval(x, y) > 0.9) body.px.copy(tail.px, ((y - by) * bw + (x - bx)) * 4, i, i + 4);
      if (oval(x, y) > 1) body.px.fill(0, i, i + 4);
    }
  }
  return { tail, body };
}

mkdirSync(join(root, 'images'), { recursive: true });
const split = splitTail();
writeFileSync(join(art, 'body-notail.png'), encode(split.body));
let sortOrder = 0;
const items = SLOTS.flatMap(([slot, defs]) =>
  defs.map(([key, name, acquire, layers, price]) => {
    const id = `${slot}-${key}`;
    const out = join(root, 'images', `${id}.png`);
    if (layers === 'body.png') writeFileSync(out, encode(split.tail));
    else if (typeof layers === 'string') copyFileSync(join(art, layers), out);
    else writeFileSync(out, encode(draw(slot, layers)));
    return { id, slot, name, image: `images/${id}.png`, acquire, price: price ?? null, unlockLevel: acquire === 'level' ? 20 : null, sortOrder: sortOrder++ };
  }),
);
writeFileSync(join(root, 'items.json'), `${JSON.stringify(items, null, 2)}\n`);
console.log(`${items.length}개 아이템 생성: ${root}`);
