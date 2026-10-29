/**
 * IKONKA GENERATORI — bog'liqliksiz (dependency-free).
 *
 * Nega qo'lda: muhitda ImageMagick ham, `sharp` ham yo'q, SVG ni rasterga
 * aylantiradigan hech narsa o'rnatilmagan. Ikonkasiz esa Windows o'rnatgichi
 * va PWA "ilovani o'rnatish" oqimi jiddiy ko'rinmaydi.
 *
 * Shuning uchun belgi (mark) SVG dan RASTERLANMAYDI — u shu yerda AYNAN
 * o'sha shakllar bilan qaytadan chiziladi: yumaloq burchakli mato maydoni
 * (chiroq yorug'i + ingichka oltin hoshiya) va "B" monogrammasi — tik kiy
 * hamda unga tegib turgan ikki fil suyagi shar. client/public/favicon.svg va
 * BrandLogo.tsx bilan bir xil geometriya (MARK) va ranglar (theme/tokens.ts).
 *
 * 4x supersampling + qutili (box) kichraytirish antialiasing beradi.
 * PNG Node ning o'z `zlib` i bilan kodlanadi, ICO esa PNG ramkalarini
 * o'z ichiga oladigan oddiy konteyner.
 *
 * Ishlatish:
 *   node desktop/build/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

/* ------------------------------------------------------- Ranglar (tokens) */

const FELT_TOP = [0x18, 0x77, 0x4c];
const FELT_BOTTOM = [0x08, 0x26, 0x1a];
/** Chiroq tushgan mato — belgining yuqorisidagi yumshoq yorug'lik */
const FELT_LIT = [0x23, 0xa0, 0x66];
const GOLD_LIGHT = [0xe8, 0xc6, 0x77];
const GOLD = [0xdb, 0xb3, 0x5c];
const GOLD_DARK = [0xbd, 0x95, 0x4a];
const IVORY_LIGHT = [0xff, 0xff, 0xff];
const IVORY = [0xf3, 0xee, 0xe2];
const IVORY_SHADE = [0xc4, 0xb9, 0xa2];
const SHADOW = [0x03, 0x12, 0x0b];
/** Zal foni (tokens bg0) — Android splash ekrani */
const HALL = [0x09, 0x0c, 0x0b];

/**
 * BELGI GEOMETRIYASI (48x48) — client/public/favicon.svg va BrandLogo.tsx bilan
 * AYNAN bir xil. "B" monogrammasi: tik turgan kiy (o'zak) + unga tegib turgan
 * ikki shar (harfning ikki qorni). Kichik o'lchamda ham "B" bo'lib o'qiladi.
 */
const MARK = {
  stem: { x: 13.6, y: 8, w: 5, h: 32, r: 2.5 },
  ferrule: 2.6,
  // Sharlar o'zakka ~1 birlik kirib turadi — "B" qorinlari harfga ulanadi
  top: { cx: 24.9, cy: 15.5, r: 7.5 },
  bottom: { cx: 25.9, cy: 31.5, r: 8.5 },
};

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
  const radius = fullBleed ? 0 : 12;

  if (!insideRoundedRect(x, y, left, left, size, size, radius)) return [0, 0, 0, 0];

  // Mato: diagonal gradient + tepadan tushgan chiroq yorug'i (stol ustidagi lampa)
  const g = clamp01((x - left) / size / 2 + (y - left) / size / 2);
  let color = mixColor(FELT_TOP, FELT_BOTTOM, g);
  const lamp = clamp01(1 - Math.hypot((x - 24) / 26, (y - 6) / 22));
  color = mixColor(color, FELT_LIT, 0.35 * lamp * lamp);

  // Ingichka oltin "inkrustatsiya" chizig'i (stol bortidagi kabi) — chetdan
  // biroz ichkarida; faqat standart (fullBleed emas) ikonkada
  if (
    !fullBleed &&
    !insideRoundedRect(x, y, left + 2.1, left + 2.1, size - 4.2, size - 4.2, radius - 2.1) &&
    insideRoundedRect(x, y, left + 1.5, left + 1.5, size - 3, size - 3, radius - 1.5)
  ) {
    color = mixColor(color, GOLD, 0.7);
  }

  const { stem, ferrule, top, bottom } = MARK;

  // Yumshoq soya (pastga-o'ngga): belgi mato ustida "turadi"
  const ballShadow = (b) => clamp01((b.r + 1 - Math.hypot(x - b.cx - 0.8, y - b.cy - 1.3)) / 2);
  const stemAxis = stem.x + stem.w / 2 + 0.8;
  const stemShadow = clamp01(
    (stem.w / 2 + 1 - distanceToSegment(x, y, stemAxis, stem.y + 1.3 + stem.r, stemAxis, stem.y + stem.h + 1.3 - stem.r)) / 2,
  );
  const shadow = Math.max(ballShadow(top), ballShadow(bottom), stemShadow);
  if (shadow > 0) color = mixColor(color, SHADOW, 0.5 * shadow);

  // O'zak — kiy: oltin silindr (chapda yaltirash), tepasida fil suyagi ferrul
  if (insideRoundedRect(x, y, stem.x, stem.y, stem.w, stem.h, stem.r)) {
    const along = (y - stem.y) / stem.h;
    const across = (x - stem.x) / stem.w;
    let c = mixColor(GOLD_LIGHT, GOLD_DARK, clamp01(along * 0.55 + across * 0.55));
    c = mixColor(c, IVORY_LIGHT, 0.35 * clamp01(1 - Math.abs(across - 0.3) / 0.2));
    if (y < stem.y + ferrule) c = mixColor(IVORY_LIGHT, IVORY_SHADE, across);
    else if (y < stem.y + ferrule + 0.5) c = mixColor(c, GOLD_DARK, 0.6);
    color = c;
  }

  // Sharlar — fil suyagi, yorug'lik yuqori-chapdan, chetida ingichka kontur
  const ball = (b) => {
    const d = Math.hypot(x - b.cx, y - b.cy);
    if (d > b.r) return null;
    const t = clamp01(Math.hypot(x - (b.cx - b.r * 0.38), y - (b.cy - b.r * 0.42)) / (b.r * 1.55));
    let c = t < 0.45 ? mixColor(IVORY_LIGHT, IVORY, t / 0.45) : mixColor(IVORY, IVORY_SHADE, (t - 0.45) / 0.55);
    c = mixColor(c, IVORY_SHADE, 0.55 * clamp01((d - b.r * 0.84) / (b.r * 0.16)));
    const spec = Math.hypot(x - (b.cx - b.r * 0.36), y - (b.cy - b.r * 0.44)) / (b.r * 0.24);
    if (spec < 1) c = mixColor(c, IVORY_LIGHT, 0.85 * (1 - spec));
    return c;
  };
  color = ball(top) ?? ball(bottom) ?? color;

  return [Math.round(color[0]), Math.round(color[1]), Math.round(color[2]), 255];
};

/**
 * `inset` — Android adaptive ikonka (108dp) uchun: belgi markaziy xavfsiz
 * zonaga (72dp) kichraytiriladi, chetlar esa mato bilan to'ldiriladi —
 * ishga tushirgich istalgan shaklda (doira/kvadrat) kesganda ham belgi
 * butun qoladi va chetida "tikuv" ko'rinmaydi.
 */
const sampleWithInset = (x, y, opts) => {
  const inset = opts.inset ?? 0;
  if (!inset) return samplePixel(x, y, opts);
  const pad = 48 * inset;
  const k = 48 / (48 - 2 * pad);
  const X = (x - pad) * k;
  const Y = (y - pad) * k;
  if (X < 0 || X > 48 || Y < 0 || Y > 48) {
    const g = clamp01((Math.min(48, Math.max(0, X)) / 48 + Math.min(48, Math.max(0, Y)) / 48) / 2);
    const c = mixColor(FELT_TOP, FELT_BOTTOM, g);
    return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255];
  }
  return samplePixel(X, Y, { ...opts, fullBleed: true });
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
          const [pr, pg, pb, pa] = sampleWithInset(x, y, opts);
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

/* ---------------------------------------------------------------- Android */

/**
 * Splash ekran: zal foni markazida brend belgisi (qisqa tomonning ~22%).
 * O'lcham Capacitor shablonidagi mavjud splash.png fayllaridan olinadi.
 */
const splashPng = (w, h) => {
  const out = Buffer.alloc(w * h * 4);
  const markSize = Math.max(48, Math.round(Math.min(w, h) * 0.22));
  const mark = renderRgba(markSize);
  const ox = Math.floor((w - markSize) / 2);
  const oy = Math.floor((h - markSize) / 2);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = (y * w + x) * 4;
      let [r, g, b] = HALL;
      const mx = x - ox;
      const my = y - oy;
      if (mx >= 0 && my >= 0 && mx < markSize && my < markSize) {
        const m = (my * markSize + mx) * 4;
        const a = mark[m + 3] / 255;
        r = Math.round(mark[m] * a + r * (1 - a));
        g = Math.round(mark[m + 1] * a + g * (1 - a));
        b = Math.round(mark[m + 2] * a + b * (1 - a));
      }
      out[idx] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      out[idx + 3] = 255;
    }
  }
  // splashPng to'rtburchak — encodePng kvadrat kutadi, shuning uchun IHDR qo'lda
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 4 + 1)] = 0;
    out.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const ANDROID_RES = 'mobile/android/app/src/main/res';
if (existsSync(resolve(REPO, ANDROID_RES))) {
  // Ishga tushirgich ikonkalari: eski (API < 26) va adaptive (API 26+) old qatlam
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, k] of Object.entries(densities)) {
    write(`${ANDROID_RES}/mipmap-${name}/ic_launcher.png`, png(Math.round(48 * k)));
    write(`${ANDROID_RES}/mipmap-${name}/ic_launcher_round.png`, png(Math.round(48 * k)));
    // 108dp kanvas, belgi markaziy 72dp da (inset = 18/108)
    write(`${ANDROID_RES}/mipmap-${name}/ic_launcher_foreground.png`, png(Math.round(108 * k), { inset: 1 / 6 }));
  }
  // Splash: mavjud fayllar o'lchamida qayta chiziladi (Capacitor logotipi o'rniga)
  for (const dir of readdirSync(resolve(REPO, ANDROID_RES))) {
    const file = resolve(REPO, ANDROID_RES, dir, 'splash.png');
    if (!existsSync(file)) continue;
    const head = readFileSync(file).subarray(16, 24);
    write(`${ANDROID_RES}/${dir}/splash.png`, splashPng(head.readUInt32BE(0), head.readUInt32BE(4)));
  }
}

// eslint-disable-next-line no-console
console.log('Tayyor.');
