/**
 * IKONKA GENERATORI — bog'liqliksiz (dependency-free).
 *
 * Nega qo'lda: muhitda ImageMagick ham, `sharp` ham yo'q, SVG ni rasterga
 * aylantiradigan hech narsa o'rnatilmagan. Ikonkasiz esa Windows o'rnatgichi
 * va PWA "ilovani o'rnatish" oqimi jiddiy ko'rinmaydi.
 *
 * Shuning uchun belgi (mark) SVG dan RASTERLANMAYDI — u shu yerda AYNAN
 * o'sha shakllar bilan qaytadan chiziladi: yumaloq burchakli maydon (mato
 * gradienti + oltin chegara), kiy chizig'i, oltin shar, yorqin nur va
 * pastdagi qora tuynuk. client/public/favicon.svg bilan bir xil geometriya
 * va bir xil ranglar (theme/tokens.ts).
 *
 * 4x supersampling + qutili (box) kichraytirish antialiasing beradi.
 * PNG Node ning o'z `zlib` i bilan kodlanadi, ICO esa PNG ramkalarini
 * o'z ichiga oladigan oddiy konteyner.
 *
 * Ishlatish:
 *   node desktop/build/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

/* ------------------------------------------------------- Ranglar (tokens) */

const FELT_TOP = [0x1a, 0x4a, 0x30];
const FELT_BOTTOM = [0x0d, 0x24, 0x19];
const GOLD_LIGHT = [0xe2, 0xc3, 0x58];
const GOLD = [0xd4, 0xaf, 0x37];
const GOLD_DARK = [0xb5, 0x92, 0x2c];
const CUE = [0xb3, 0xbf, 0xb8];
const HOLE = [0x0d, 0x24, 0x19];

/* ------------------------------------------------------- Chizish yordamchilari */

const lerp = (a, b, t) => a + (b - a) * t;
const mixColor = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Nuqta yumaloq burchakli to'rtburchak ichidami (48x48 koordinata tizimida) */
const insideRoundedRect = (x, y, left, top, w, h, r) => {
  const right = left + w;
  const bottom = top + h;
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = x < left + r ? left + r : x > right - r ? right - r : x;
  const cy = y < top + r ? top + r : y > bottom - r ? bottom - r : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};

/** Nuqtadan kesmagacha bo'lgan masofa */
const distanceToSegment = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : clamp01(((px - x1) * dx + (py - y1) * dy) / lenSq);
  const nx = x1 + t * dx;
  const ny = y1 + t * dy;
  return Math.hypot(px - nx, py - ny);
};

/**
 * Bitta nuqtaning rangi (48x48 tizimida). Qaytadi: [r, g, b, a] 0..255.
 * `padding` — maskable ikonka uchun belgini kichraytirish (xavfsiz zona).
 */
const samplePixel = (x, y, opts) => {
  const { fullBleed } = opts;

  // Maydon: standart ikonkada 1..47, maskable da butun kvadrat (fon to'liq)
  const left = fullBleed ? 0 : 1;
  const size = fullBleed ? 48 : 46;
  const radius = fullBleed ? 0 : 11;

  if (!insideRoundedRect(x, y, left, left, size, size, radius)) return [0, 0, 0, 0];

  // Mato gradienti (chapdan yuqoridan o'ngga pastga)
  const g = clamp01((x - left) / size / 2 + (y - left) / size / 2);
  let color = mixColor(FELT_TOP, FELT_BOTTOM, g);

  // Oltin chegara — faqat standart (fullBleed emas) ikonkada
  if (!fullBleed) {
    const outer = insideRoundedRect(x, y, left, left, size, size, radius);
    const inner = insideRoundedRect(x, y, left + 1.5, left + 1.5, size - 3, size - 3, radius - 1.5);
    if (outer && !inner) color = mixColor(color, GOLD, 0.6);
  }

  // Kiy chizig'i (9,39) -> (36,12), qalinlik 2.4
  const cueDist = distanceToSegment(x, y, 9, 39, 36, 12);
  if (cueDist <= 1.2) color = mixColor(color, CUE, 0.75);

  // Oltin shar: markaz (29,28), radius 10, radial gradient (0.35, 0.3)
  const ballDx = x - 29;
  const ballDy = y - 28;
  const ballDist = Math.hypot(ballDx, ballDy);
  if (ballDist <= 10) {
    // Gradient markazi shardan yuqori-chapda — hajm hissi
    const gx = 29 - 10 * 0.3;
    const gy = 28 - 10 * 0.4;
    const t = clamp01(Math.hypot(x - gx, y - gy) / (10 * 1.6));
    color = t < 0.55 ? mixColor(GOLD_LIGHT, GOLD, t / 0.55) : mixColor(GOLD, GOLD_DARK, (t - 0.55) / 0.45);
  }

  // Yorqin nur (25.5, 24.5) r=3
  const glowDist = Math.hypot(x - 25.5, y - 24.5);
  if (glowDist <= 3) color = mixColor(color, [255, 255, 255], 0.55 * (1 - glowDist / 3));

  // Qora tuynuk (31, 30.5) r=4.4
  const holeDist = Math.hypot(x - 31, y - 30.5);
  if (holeDist <= 4.4) color = mixColor(color, HOLE, 0.9);

  return [Math.round(color[0]), Math.round(color[1]), Math.round(color[2]), 255];
};

/** Berilgan o'lchamda RGBA bufer chizadi (4x supersampling bilan) */
const renderRgba = (size, opts = {}) => {
  const SS = 4;
  const out = Buffer.alloc(size * size * 4);
  const scale = 48 / (size * SS);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = ((px * SS + sx) + 0.5) * scale;
          const y = ((py * SS + sy) + 0.5) * scale;
          const [pr, pg, pb, pa] = samplePixel(x, y, opts);
          const alpha = pa / 255;
          r += pr * alpha;
          g += pg * alpha;
          b += pb * alpha;
          a += pa;
        }
      }
      const samples = SS * SS;
      const alphaSum = a / 255;
      const idx = (py * size + px) * 4;
      // Rang alfa bo'yicha o'rtachalanadi (premultiplied dan qaytarish)
      out[idx] = alphaSum > 0 ? Math.round(r / alphaSum) : 0;
      out[idx + 1] = alphaSum > 0 ? Math.round(g / alphaSum) : 0;
      out[idx + 2] = alphaSum > 0 ? Math.round(b / alphaSum) : 0;
      out[idx + 3] = Math.round(a / samples);
    }
  }
  return out;
};

/* ------------------------------------------------------------ PNG kodlash */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
};

const encodePng = (rgba, size) => {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Har qator oldiga filtr baytini (0 = None) qo'yamiz
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

/* ------------------------------------------------------------ ICO kodlash */

/** ICO — PNG ramkalarini o'z ichiga oladigan oddiy konteyner (Vista+) */
const encodeIco = (frames) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(frames.length, 4);

  const entries = [];
  let offset = 6 + frames.length * 16;
  for (const frame of frames) {
    const entry = Buffer.alloc(16);
    entry[0] = frame.size >= 256 ? 0 : frame.size; // 0 = 256
    entry[1] = frame.size >= 256 ? 0 : frame.size;
    entry[2] = 0; // palitra yo'q
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32BE(0, 8);
    entry.writeUInt32LE(frame.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += frame.data.length;
  }

  return Buffer.concat([header, ...entries, ...frames.map((f) => f.data)]);
};

/* ----------------------------------------------------------------- Yozish */

const write = (relativePath, buffer) => {
  const full = resolve(REPO, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, buffer);
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${relativePath} (${(buffer.length / 1024).toFixed(1)} KB)`);
};

const png = (size, opts) => encodePng(renderRgba(size, opts), size);

// eslint-disable-next-line no-console
console.log('Ikonkalar yasalmoqda…');

// Desktop (electron-builder)
write(
  'desktop/build/icon.ico',
  encodeIco([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, data: png(size) }))),
);
write('desktop/build/icon.png', png(512));

// Veb / PWA — o'rnatiladigan ilova ikonkalari
write('client/public/icon-192.png', png(192));
write('client/public/icon-512.png', png(512));
// maskable: fon to'liq (burchaklarsiz), belgi kesilmasin
write('client/public/icon-512-maskable.png', png(512, { fullBleed: true }));
write('client/public/apple-touch-icon.png', png(180));

// eslint-disable-next-line no-console
console.log('Tayyor.');
