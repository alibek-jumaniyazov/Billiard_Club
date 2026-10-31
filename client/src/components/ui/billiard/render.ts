/**
 * Billiard stolini chizish (canvas 2D) — protsedural, tashqi rasmsiz.
 *
 * Ikki qatlam:
 *  · STATIK (buildTableLayer) — yog'och korpus, bortlar, mato, teshiklar.
 *    O'lcham o'zgargandagina bir marta chiziladi va keshlanadi;
 *  · DINAMIK (drawScene) — har kadrda faqat soyalar, sharlar, mo'ljal va kiy.
 *
 * Yorug'lik: zaldagidek UCH QALPOQLI lampa stol uzunligi bo'ylab. Har lampa
 * matoda yorug' "ko'l" hosil qiladi, har shar har lampadan alohida yumshoq soya
 * tashlaydi (yaqin lampaniki to'qroq) va sirtida uchta yaltiroq aks ko'rinadi —
 * haqiqiy stol suratidagidek.
 */
import { BRAND } from '../../../theme/tokens';
import { cuePathAfterContact } from './controls';
import { R, rotateByQuat, type AimInfo, type Ball, type Table, type World } from './physics';

export const IVORY = '#f2ede1';
export const CUE_RED = '#c8372b';
const INK = '#2b2219';
const BALL_FONT = "'Onest Variable', 'Segoe UI', Roboto, sans-serif";
/** Lampa balandligi (R birligida) — soya uzunligi shundan */
const LAMP_H = 36;
/** Uch qalpoqli lampa: stol uzunligi bo'ylab (L ulushida), eni bo'yicha o'rtada */
const LAMPS = [0.2, 0.5, 0.8] as const;

/** Har lampaning shu nuqtadagi ulushi (masofa kvadratiga teskari) — yig'indisi 1 */
const lampWeights = (table: Table, x: number, y: number): number[] => {
  const raw = LAMPS.map((f) => 1 / ((x - table.L * f) ** 2 + (y - table.B / 2) ** 2 + LAMP_H ** 2));
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => v / total);
};

/**
 * Soya va yaltiroq nuqta — oldindan chizilgan yumshoq dog'lar (sprite).
 * Har kadrda o'nlab radial gradient yaratish o'rniga bitta tayyor rasm
 * drawImage bilan qo'yiladi — zaif telefonlarda ham 60 kadr.
 */
const spriteCache = new Map<string, HTMLCanvasElement>();
const softSprite = (kind: 'shadow' | 'spec', px: number): HTMLCanvasElement => {
  const size = Math.max(8, Math.ceil(px / 4) * 4);
  const key = `${kind}:${size}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    if (kind === 'shadow') {
      g.addColorStop(0, 'rgba(0, 0, 0, 1)');
      g.addColorStop(0.45, 'rgba(0, 0, 0, 0.62)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      g.addColorStop(0, 'rgba(255, 255, 255, 1)');
      g.addColorStop(0.3, 'rgba(255, 255, 255, 0.55)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  if (spriteCache.size > 24) spriteCache.clear();
  spriteCache.set(key, canvas);
  return canvas;
};

export interface View {
  w: number;
  h: number;
  dpr: number;
  /** 1 R necha CSS piksel */
  s: number;
  /** Maydon burchagi (0,0) ning ekrandagi o'rni */
  ox: number;
  oy: number;
}

export interface CuePose {
  /** Zarba boshlangan nuqta (biток markazi) */
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  /** Kiy uchi bilan shar orasidagi masofa (R); manfiy — zarbadan keyingi davom */
  gap: number;
  alpha: number;
}

export interface GuideDraw {
  aim: AimInfo;
  alpha: number;
  /** Zarba kuchi 0..1 — bashorat chiziqlari kuch bilan uzayadi */
  power?: number;
  /** Vertikal vint (physics.strike): biток yo'li nakat/ottyajkaga egiladi */
  vertical?: number;
}

/** Kuch halqasi — bosib turilganda biток atrofida */
export interface PowerDraw {
  x: number;
  y: number;
  /** Kiy yo'nalishi — halqa uzilishi kiy tomonida bo'ladi */
  dirX: number;
  dirY: number;
  /** 0..1 */
  value: number;
  /** 100% da sekin "nafas olish" (0..1) */
  pulse: number;
  /** false — qo'yib yuborilsa zarba bekor bo'ladi (ko'rsatkich stoldan tashqarida) */
  armed: boolean;
}

/** Qisqa effektlar: zarba chaqnashi va teshik ustidagi "+1" */
export interface EffectsDraw {
  now: number;
  flashes: { x: number; y: number; at: number; power: number }[];
  pops: { x: number; y: number; dx: number; dy: number; at: number; text: string }[];
}

export const FLASH_MS = 260;
export const POP_MS = 950;

export const computeView = (table: Table, w: number, h: number, dpr: number): View => {
  const s = Math.min(w / table.outerW, h / table.outerH);
  const edge = table.cushion + table.rail;
  return {
    w,
    h,
    dpr,
    s,
    ox: (w - table.outerW * s) / 2 + edge * s,
    oy: (h - table.outerH * s) / 2 + edge * s,
  };
};

export const toWorld = (view: View, px: number, py: number) => ({
  x: (px - view.ox) / view.s,
  y: (py - view.oy) / view.s,
});

/* ------------------------------------------------------------- Ranglar */

const parseHex = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mix = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${c(ar, br)}, ${c(ag, bg)}, ${c(ab, bb)})`;
};

const rgba = (hex: string, alpha: number): string => {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** mix() ning shaffof varianti */
const mixA = (a: string, b: string, t: number, alpha: number): string => {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgba(${c(ar, br)}, ${c(ag, bg)}, ${c(ab, bb)}, ${alpha})`;
};

/** Kuch rangi: zumrad (yumshoq) → oltin → qizil (eng kuchli) */
export const powerColor = (t: number): string => {
  const { emerald, gold, semantic } = BRAND;
  const k = Math.min(1, Math.max(0, t));
  return k < 0.55 ? mix(emerald.glow, gold.base, k / 0.55) : mix(gold.base, semantic.error, (k - 0.55) / 0.45);
};

/** Determinik tasodif — yog'och tolasi har o'lchamda bir xil chiqsin */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const roundRectPath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
};

const polygon = (ctx: CanvasRenderingContext2D, pts: number[][]) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
};

/** Mato donadorligi — mayda shovqin plitkasi (qurilma piksellarida) */
const noiseTile = (size: number): HTMLCanvasElement => {
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext('2d');
  if (!tctx) return tile;
  const img = tctx.createImageData(size, size);
  const rnd = seeded(7);
  for (let i = 0; i < img.data.length; i += 4) {
    const light = rnd() > 0.5;
    const v = light ? 255 : 0;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.round(rnd() * (light ? 14 : 22));
  }
  tctx.putImageData(img, 0, 0);
  return tile;
};

/** Mato tolasi (nap) — stol uzunligi bo'ylab yotgan nozik, kalta chiziqlar */
const napTile = (size: number): HTMLCanvasElement => {
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext('2d');
  if (!tctx) return tile;
  const rnd = seeded(23);
  tctx.lineCap = 'round';
  for (let i = 0; i < size * 3; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const len = 5 + rnd() * 16;
    const light = rnd() > 0.5;
    tctx.strokeStyle = light ? `rgba(255, 255, 255, ${0.02 + rnd() * 0.03})` : `rgba(0, 0, 0, ${0.025 + rnd() * 0.045})`;
    tctx.lineWidth = 0.6 + rnd() * 0.7;
    tctx.beginPath();
    tctx.moveTo(x, y);
    tctx.lineTo(x + len, y + (rnd() - 0.5) * 0.9);
    tctx.stroke();
  }
  return tile;
};

/* ------------------------------------------------------- Statik qatlam */

export const buildTableLayer = (table: Table, view: View): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(view.w * view.dpr));
  canvas.height = Math.max(1, Math.round(view.h * view.dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const { emerald, wood, gold } = BRAND;
  const { L, B, cushion: c, rail: rw } = table;
  const k = view.dpr * view.s;
  const worldSpace = () => ctx.setTransform(k, 0, 0, k, view.dpr * view.ox, view.dpr * view.oy);
  worldSpace();

  const x0 = -c - rw;
  const y0 = -c - rw;
  const OW = L + 2 * (c + rw);
  const OH = B + 2 * (c + rw);
  const corner = 1.8;

  // 1) Yog'och korpus — tepadan yorug'roq (lampa), pastga to'qlashadi
  roundRectPath(ctx, x0, y0, OW, OH, corner);
  const body = ctx.createLinearGradient(0, y0, 0, y0 + OH);
  body.addColorStop(0, wood.light);
  body.addColorStop(0.22, wood.base);
  body.addColorStop(0.78, wood.base);
  body.addColorStop(1, wood.dark);
  ctx.fillStyle = body;
  ctx.fill();

  // 2) Har bortga o'z yo'nalishidagi tola (burchaklarda 45° "us" birikmasi)
  // across: [tashqi qirra, ichki qirra] — profil gradienti shu tartibda
  const rails: { pts: number[][]; horizontal: boolean; from: number; to: number; across: [number, number] }[] = [
    { pts: [[x0, y0], [x0 + OW, y0], [L + c, -c], [-c, -c]], horizontal: true, from: x0, to: x0 + OW, across: [y0, -c] },
    { pts: [[x0, y0 + OH], [x0 + OW, y0 + OH], [L + c, B + c], [-c, B + c]], horizontal: true, from: x0, to: x0 + OW, across: [y0 + OH, B + c] },
    { pts: [[x0, y0], [-c, -c], [-c, B + c], [x0, y0 + OH]], horizontal: false, from: y0, to: y0 + OH, across: [x0, -c] },
    { pts: [[x0 + OW, y0], [L + c, -c], [L + c, B + c], [x0 + OW, y0 + OH]], horizontal: false, from: y0, to: y0 + OH, across: [x0 + OW, L + c] },
  ];
  const rnd = seeded(11);
  for (const rail of rails) {
    ctx.save();
    polygon(ctx, rail.pts);
    ctx.clip();
    const [a0, a1] = rail.across;
    const lines = 34;
    for (let i = 0; i < lines; i++) {
      const base = a0 + ((a1 - a0) * (i + rnd())) / lines;
      const phase = rnd() * Math.PI * 2;
      const freq = 0.18 + rnd() * 0.25;
      const amp = 0.04 + rnd() * 0.1;
      const dark = rnd() > 0.35;
      ctx.strokeStyle = dark ? `rgba(18, 9, 3, ${0.05 + rnd() * 0.13})` : `rgba(255, 214, 160, ${0.03 + rnd() * 0.06})`;
      ctx.lineWidth = 0.025 + rnd() * 0.07;
      ctx.beginPath();
      for (let t = rail.from; t <= rail.to + 0.5; t += 0.5) {
        const off = base + Math.sin(t * freq + phase) * amp + Math.sin(t * freq * 3.1 + phase * 2) * amp * 0.35;
        if (rail.horizontal) {
          if (t === rail.from) ctx.moveTo(t, off);
          else ctx.lineTo(t, off);
        } else if (t === rail.from) ctx.moveTo(off, t);
        else ctx.lineTo(off, t);
      }
      ctx.stroke();
    }
    // Bort profili: tashqi qirra soyada, o'rtasi yaltiroq, ichki qiyalik to'q
    const [p0, p1] = rail.across;
    const prof = rail.horizontal ? ctx.createLinearGradient(0, p0, 0, p1) : ctx.createLinearGradient(p0, 0, p1, 0);
    prof.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
    prof.addColorStop(0.1, 'rgba(255, 236, 205, 0.14)');
    prof.addColorStop(0.42, 'rgba(255, 255, 255, 0.05)');
    prof.addColorStop(0.86, 'rgba(0, 0, 0, 0.1)');
    prof.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = prof;
    ctx.fillRect(x0, y0, OW, OH);
    ctx.restore();
  }
  // Burchak birikma chiziqlari (miter)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(x0 + 0.5, y0 + 0.5);
  ctx.lineTo(-c, -c);
  ctx.moveTo(x0 + OW - 0.5, y0 + 0.5);
  ctx.lineTo(L + c, -c);
  ctx.moveTo(x0 + 0.5, y0 + OH - 0.5);
  ctx.lineTo(-c, B + c);
  ctx.moveTo(x0 + OW - 0.5, y0 + OH - 0.5);
  ctx.lineTo(L + c, B + c);
  ctx.stroke();

  // 3) Oltin inkrustatsiya ipi va tashqi qirra yaltirog'i
  roundRectPath(ctx, x0 + 0.5, y0 + 0.5, OW - 1, OH - 1, corner - 0.5);
  ctx.strokeStyle = rgba(gold.base, 0.55);
  ctx.lineWidth = 0.07;
  ctx.stroke();
  roundRectPath(ctx, x0 + 0.04, y0 + 0.04, OW - 0.08, OH - 0.08, corner);
  ctx.strokeStyle = 'rgba(255, 230, 190, 0.16)';
  ctx.lineWidth = 0.08;
  ctx.stroke();

  // 3b) Lak yaltirog'i — har lampaning bortdagi cho'zinchoq aksi (pastki bort xiraroq:
  // nur unga qiyaroq tushadi). Matoga oshib o'tgan qismini keyin mato yopadi.
  const gloss = (x: number, y: number, rx: number, ry: number, a: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(255, 240, 214, ${a})`);
    g.addColorStop(0.45, `rgba(255, 240, 214, ${a * 0.35})`);
    g.addColorStop(1, 'rgba(255, 240, 214, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  for (const f of LAMPS) {
    gloss(L * f, -c - rw * 0.42, L * 0.1, rw * 0.2, 0.22);
    gloss(L * f, B + c + rw * 0.55, L * 0.1, rw * 0.18, 0.11);
  }
  gloss(-c - rw * 0.45, B / 2, rw * 0.18, B * 0.22, 0.1);
  gloss(L + c + rw * 0.45, B / 2, rw * 0.18, B * 0.22, 0.1);

  // 4) Nishonlar (diamonds) — sadaf, bort o'rtasida
  const diamond = (x: number, y: number, horizontal: boolean) => {
    const a = horizontal ? 0.42 : 0.26;
    const b = horizontal ? 0.26 : 0.42;
    const g = ctx.createRadialGradient(x - 0.08, y - 0.08, 0.02, x, y, 0.45);
    g.addColorStop(0, '#fffaf0');
    g.addColorStop(0.6, '#e8dfcc');
    g.addColorStop(1, '#b7ab93');
    polygon(ctx, [[x, y - b], [x + a, y], [x, y + b], [x - a, y]]);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 0.03;
    ctx.stroke();
  };
  const railMid = c + rw * 0.52;
  for (const kx of [1, 2, 3, 5, 6, 7]) {
    diamond((L * kx) / 8, -railMid, true);
    diamond((L * kx) / 8, B + railMid, true);
  }
  for (const ky of [1, 2, 3]) {
    diamond(-railMid, (B * ky) / 4, false);
    diamond(L + railMid, (B * ky) / 4, false);
  }

  // 5) Teshik "yoqasi" — bort ustidagi jez qoplama va ichki charm (rus stollaridagidek).
  // Mato keyin chiziladi va yoqaning maydon tomonidagi yarmini yopadi.
  for (const p of table.pockets) {
    const outer = p.hole + (p.corner ? 1.0 : 0.82);
    const brass = ctx.createLinearGradient(p.x - outer, p.y - outer, p.x + outer, p.y + outer);
    // Eskirgan jez: yorug' tomoni xira, qolgani qoramtir (yangi oltin emas)
    brass.addColorStop(0, '#e3cb8e');
    brass.addColorStop(0.32, '#b58e48');
    brass.addColorStop(0.66, '#7f612a');
    brass.addColorStop(1, '#4e3915');
    ctx.beginPath();
    ctx.arc(p.x, p.y, outer, 0, Math.PI * 2);
    ctx.fillStyle = brass;
    ctx.fill();
    // Metall qirralari: tashqi — yorug' chiziq, undan tashqarisi — yog'ochga soya
    ctx.strokeStyle = 'rgba(255, 246, 216, 0.6)';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.arc(p.x, p.y, outer - 0.05, Math.PI * 0.9, Math.PI * 1.75);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(30, 16, 4, 0.55)';
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.arc(p.x, p.y, outer + 0.02, 0, Math.PI * 2);
    ctx.stroke();
    // Ichki charm qoplama
    const leather = ctx.createRadialGradient(p.x, p.y, p.hole * 0.8, p.x, p.y, p.hole + 0.34);
    leather.addColorStop(0, '#120b06');
    leather.addColorStop(1, '#2a1b10');
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.hole + 0.34, 0, Math.PI * 2);
    ctx.fillStyle = leather;
    ctx.fill();
  }

  // 6) Mato — asosiy rang, ustida har lampaning iliq yorug' "ko'li" (eni bo'yicha cho'zinchoq)
  ctx.save();
  ctx.beginPath();
  ctx.rect(-c, -c, L + 2 * c, B + 2 * c);
  ctx.clip();
  ctx.fillStyle = mix(emerald.felt, emerald.base, 0.35);
  ctx.fillRect(-c, -c, L + 2 * c, B + 2 * c);
  const poolColor = (alpha: number) => mixA(emerald.bright, '#fff4d6', 0.32, alpha);
  for (const f of LAMPS) {
    ctx.save();
    ctx.translate(L * f, B / 2);
    ctx.scale(1, 0.84);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, B * 0.82);
    pool.addColorStop(0, poolColor(0.5));
    pool.addColorStop(0.42, poolColor(0.2));
    pool.addColorStop(1, poolColor(0));
    ctx.fillStyle = pool;
    ctx.fillRect(-L, -B * 1.5, L * 2, B * 3);
    ctx.restore();
  }
  ctx.restore();

  // 7) Rezina bortlar — og'izlarda qiya kesilgan (facing)
  const cm = table.cornerMouth;
  const sm = table.sideMouth;
  const kc = table.cornerFacing;
  const ks = table.sideFacing;
  const cushions: { pts: number[][]; nose: [number, number, number, number]; back: [number, number, number, number] }[] = [
    { pts: [[cm, 0], [L / 2 - sm, 0], [L / 2 - sm + ks, -c], [cm - kc, -c]], nose: [cm, 0, L / 2 - sm, 0], back: [0, 0, 0, -c] },
    { pts: [[L / 2 + sm, 0], [L - cm, 0], [L - cm + kc, -c], [L / 2 + sm - ks, -c]], nose: [L / 2 + sm, 0, L - cm, 0], back: [0, 0, 0, -c] },
    { pts: [[cm, B], [L / 2 - sm, B], [L / 2 - sm + ks, B + c], [cm - kc, B + c]], nose: [cm, B, L / 2 - sm, B], back: [0, B, 0, B + c] },
    { pts: [[L / 2 + sm, B], [L - cm, B], [L - cm + kc, B + c], [L / 2 + sm - ks, B + c]], nose: [L / 2 + sm, B, L - cm, B], back: [0, B, 0, B + c] },
    { pts: [[0, cm], [0, B - cm], [-c, B - cm + kc], [-c, cm - kc]], nose: [0, cm, 0, B - cm], back: [0, 0, -c, 0] },
    { pts: [[L, cm], [L, B - cm], [L + c, B - cm + kc], [L + c, cm - kc]], nose: [L, cm, L, B - cm], back: [L, 0, L + c, 0] },
  ];
  for (const cu of cushions) {
    const [bx0, by0, bx1, by1] = cu.back;
    const g = ctx.createLinearGradient(bx0, by0, bx1, by1);
    g.addColorStop(0, mix(emerald.base, '#fff1d2', 0.08));
    g.addColorStop(0.35, emerald.felt);
    g.addColorStop(1, emerald.deepest);
    polygon(ctx, cu.pts);
    ctx.fillStyle = g;
    ctx.fill();
    // Tumshuq ustidagi yorug' chiziq
    const [nx0, ny0, nx1, ny1] = cu.nose;
    ctx.beginPath();
    ctx.moveTo(nx0, ny0);
    ctx.lineTo(nx1, ny1);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
    ctx.lineWidth = 0.07;
    ctx.stroke();
  }
  // Bort ichki qirrasi (yog'och bilan uchrashgan joy)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 0.1;
  ctx.strokeRect(-c, -c, L + 2 * c, B + 2 * c);

  // 8) Bort tumshug'i matoga tushirgan nozik soya
  const noseShadow = (xA: number, yA: number, xB: number, yB: number, dx: number, dy: number) => {
    const g = ctx.createLinearGradient(xA, yA, xA + dx, yA + dy);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    polygon(ctx, [[xA, yA], [xB, yB], [xB + dx, yB + dy], [xA + dx, yA + dy]]);
    ctx.fill();
  };
  noseShadow(cm, 0, L - cm, 0, 0, 0.9);
  noseShadow(cm, B, L - cm, B, 0, -0.9);
  noseShadow(0, cm, 0, B - cm, 0.9, 0);
  noseShadow(L, cm, L, B - cm, -0.9, 0);

  // 9) Mato donadorligi — qurilma piksellarida (masshtab tufayli "katak" bo'lmasin)
  const pattern = ctx.createPattern(noiseTile(128), 'repeat');
  const nap = ctx.createPattern(napTile(192), 'repeat');
  if (pattern) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(
      view.dpr * (view.ox - c * view.s),
      view.dpr * (view.oy - c * view.s),
      view.dpr * (L + 2 * c) * view.s,
      view.dpr * (B + 2 * c) * view.s,
    );
    ctx.clip();
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (nap) {
      ctx.fillStyle = nap;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
    worldSpace();
  }

  // 10) Vinyetka — lampa yorug'i chetlarga yetmaydi
  const vig = ctx.createRadialGradient(L / 2, B / 2, B * 0.45, L / 2, B / 2, L * 0.62);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
  ctx.fillStyle = vig;
  ctx.fillRect(-c, -c, L + 2 * c, B + 2 * c);

  // 11) "Uy" chizig'i va nuqtalar
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(table.headX, 0);
  ctx.lineTo(table.headX, B);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  for (const sx of [table.headX, L / 2, table.footX]) {
    ctx.beginPath();
    ctx.arc(sx, B / 2, 0.13, 0, Math.PI * 2);
    ctx.fill();
  }

  // 12) Teshiklar — chuqur og'iz, tubida to'r savat, yuqori lab lampa nurini ushlaydi
  for (const p of table.pockets) {
    // Tashqariga (stol markazidan teshik tomon) — to'r tubi shu tomonda ko'rinadi
    const ol = Math.hypot(p.x - L / 2, p.y - B / 2) || 1;
    const ox = ((p.x - L / 2) / ol) * p.hole * 0.28;
    const oy = ((p.y - B / 2) / ol) * p.hole * 0.28;
    // Markaz tomondagi devor nurga teskari — eng qorong'i shu yerda
    const g = ctx.createRadialGradient(p.x - ox, p.y - oy, 0.1, p.x, p.y, p.hole);
    g.addColorStop(0, '#000');
    g.addColorStop(0.68, '#050302');
    g.addColorStop(1, '#22170e');
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.hole, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // To'r: chuqurlikdagi ikki yo'nalishli nozik ip, chetga qarab yo'qoladi
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x + ox, p.y + oy, p.hole * 0.66, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(196, 176, 138, 0.13)';
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    for (let i = -8; i <= 8; i++) {
      const d = i * 0.34;
      ctx.moveTo(p.x + d - 3, p.y - 3);
      ctx.lineTo(p.x + d + 3, p.y + 3);
      ctx.moveTo(p.x + d + 3, p.y - 3);
      ctx.lineTo(p.x + d - 3, p.y + 3);
    }
    ctx.stroke();
    const fade = ctx.createRadialGradient(p.x + ox, p.y + oy, p.hole * 0.2, p.x + ox, p.y + oy, p.hole * 0.66);
    fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    ctx.fillStyle = fade;
    ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    ctx.restore();
    // Og'iz qirrasi: to'q chiziq + tashqi ichki devor lampa nurini ushlaydi (nozik yorug' o'roq)
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.hole - 0.08, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.lineWidth = 0.16;
    ctx.stroke();
    const toCenter = Math.atan2(B / 2 - p.y, L / 2 - p.x);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.hole - 0.1, toCenter + Math.PI - 1.05, toCenter + Math.PI + 1.05);
    ctx.strokeStyle = 'rgba(255, 232, 196, 0.16)';
    ctx.lineWidth = 0.06;
    ctx.stroke();
  }

  return canvas;
};

/* --------------------------------------------------------- Dinamik qatlam */

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Ikki tomonga bosilgan raqam (rus sharlarida raqam qarama-qarshi ikki tomonda) */
const DECALS: { n: [number, number, number]; up: [number, number, number] }[] = [
  { n: [0, 0, -1], up: [0, -1, 0] },
  { n: [0, 0, 1], up: [0, -1, 0] },
];

const ballScale = (b: Ball) => (b.phase === 'sinking' ? 1 - 0.42 * b.sink : 1);

const drawShadows = (ctx: CanvasRenderingContext2D, world: World, view: View) => {
  const { table } = world;
  const sprite = softSprite('shadow', R * view.s * 2.5 * view.dpr);
  for (const b of world.balls) {
    if (b.phase === 'gone') continue;
    const fade = b.phase === 'sinking' ? 1 - b.sink : 1;
    const rr = R * view.s * ballScale(b);
    const cx = view.ox + b.x * view.s;
    const cy = view.oy + b.y * view.s;
    // Har lampadan alohida soya — undan uzoqqa, masofaga mutanosib cho'ziladi.
    // Yaqin lampa ko'proq nur beradi, shuning uchun uning soyasi to'qroq.
    const weights = lampWeights(table, b.x, b.y);
    LAMPS.forEach((f, i) => {
      const offX = ((b.x - table.L * f) * R) / (LAMP_H - R);
      const offY = ((b.y - table.B / 2) * R) / (LAMP_H - R);
      const off = Math.hypot(offX, offY);
      const d = rr * 2.5;
      ctx.save();
      ctx.globalAlpha = 0.9 * weights[i] * fade;
      ctx.translate(cx + offX * view.s, cy + offY * view.s + rr * 0.08);
      ctx.rotate(Math.atan2(offY, offX));
      ctx.scale(1 + off * 0.5, 1);
      ctx.drawImage(sprite, -d / 2, -d / 2, d, d);
      ctx.restore();
    });
    // Tegish joyidagi qorong'ilik (ambient occlusion)
    const ao = ctx.createRadialGradient(cx, cy, rr * 0.6, cx, cy, rr * 1.14);
    ao.addColorStop(0, `rgba(0, 0, 0, ${0.45 * fade})`);
    ao.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ao;
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 1.14, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawBall = (ctx: CanvasRenderingContext2D, b: Ball, world: World, view: View) => {
  const { L, B } = world.table;
  const { emerald } = BRAND;
  const rr = R * view.s * ballScale(b);
  if (rr < 0.5) return;
  const cx = view.ox + b.x * view.s;
  const cy = view.oy + b.y * view.s;
  const cue = b.id === 0;

  // Yaltiroq nuqtalar — har lampaning aksi: lampa va ko'z (tepada) orasidagi yarim
  // vektor + ozgina badiiy siljish. Uchtasi bir qatorda, yaqin lampaniki eng yorqin.
  const weights = lampWeights(world.table, b.x, b.y);
  const highlights = LAMPS.map((f, i) => {
    const lx = L * f - b.x;
    const ly = B / 2 - b.y;
    const len = Math.hypot(lx, ly, LAMP_H);
    const hx0 = lx / len;
    const hy0 = ly / len;
    const hz0 = LAMP_H / len + 1;
    const hl = Math.hypot(hx0, hy0, hz0);
    return { x: cx + ((hx0 / hl) * 0.9 - 0.12) * rr, y: cy + ((hy0 / hl) * 0.9 - 0.3) * rr, w: weights[i] };
  });
  // Asosiy yoritilgan tomon — lampalar ulushi bo'yicha o'rtacha
  const hx = highlights.reduce((sum, h) => sum + h.x * h.w, 0);
  const hy = highlights.reduce((sum, h) => sum + h.y * h.w, 0);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, Math.PI * 2);
  ctx.clip();

  const body = ctx.createRadialGradient(hx, hy, rr * 0.03, cx + (hx - cx) * 0.25, cy + (hy - cy) * 0.25, rr * 1.06);
  if (cue) {
    body.addColorStop(0, '#ffb8ab');
    body.addColorStop(0.22, '#e65848');
    body.addColorStop(0.62, CUE_RED);
    body.addColorStop(0.9, '#8c1d15');
    body.addColorStop(1, '#5a110b');
  } else {
    body.addColorStop(0, '#fffdf8');
    body.addColorStop(0.2, '#fbf6eb');
    body.addColorStop(0.58, IVORY);
    body.addColorStop(0.88, '#cbc1ad');
    body.addColorStop(1, '#948a76');
  }
  ctx.fillStyle = body;
  ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);

  // Raqam (yoki biтокdagi oq nuqta) — shar aylanishi bilan birga yuradi
  for (const d of DECALS) {
    const [nx, ny, nz] = rotateByQuat(b.q, d.n[0], d.n[1], d.n[2]);
    const facing = -nz;
    if (facing < 0.06) continue;
    const [ex, ey, ez] = rotateByQuat(b.q, d.up[0], d.up[1], d.up[2]);
    // Dekal tekisligining ekrandagi bazisi: o'ng = e × n, past = −e
    const rx = ey * nz - ez * ny;
    const ry = ez * nx - ex * nz;
    ctx.save();
    ctx.globalAlpha = smooth(0.06, 0.38, facing);
    ctx.setTransform(
      view.dpr * rx,
      view.dpr * ry,
      -view.dpr * ex,
      -view.dpr * ey,
      view.dpr * (cx + nx * rr * 0.97),
      view.dpr * (cy + ny * rr * 0.97),
    );
    if (cue) {
      ctx.beginPath();
      ctx.arc(0, 0, rr * 0.17, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 246, 236, 0.92)';
      ctx.fill();
    } else {
      const label = String(b.id);
      const size = rr * (label.length > 1 ? 0.8 : 0.95);
      ctx.font = `700 ${size}px ${BALL_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.fillText(label, 0, size * 0.05);
    }
    ctx.restore();
  }

  // Pastki chetda yashil mato aksi va hajm beruvchi qorong'i hoshiya
  const bounce = ctx.createRadialGradient(
    cx - (hx - cx) * 0.9,
    cy - (hy - cy) * 0.9,
    0,
    cx - (hx - cx) * 0.9,
    cy - (hy - cy) * 0.9,
    rr * 0.95,
  );
  bounce.addColorStop(0, rgba(emerald.bright, 0.22));
  bounce.addColorStop(1, rgba(emerald.bright, 0));
  ctx.fillStyle = bounce;
  ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);

  const rim = ctx.createRadialGradient(cx, cy, rr * 0.74, cx, cy, rr);
  rim.addColorStop(0, 'rgba(0, 0, 0, 0)');
  rim.addColorStop(1, 'rgba(0, 0, 0, 0.24)');
  ctx.fillStyle = rim;
  ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);

  // Lampa akslari (specular) — uch qalpoq, uch nuqta
  const top = Math.max(...weights);
  const spec = softSprite('spec', rr * 0.7 * view.dpr);
  for (const h of highlights) {
    const k = h.w / top;
    const d = rr * (0.34 + 0.24 * k);
    ctx.globalAlpha = 0.42 + 0.53 * k;
    ctx.drawImage(spec, h.x - d / 2, h.y - d / 2, d, d);
  }
  ctx.globalAlpha = 1;

  if (b.phase === 'sinking') {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.75 * b.sink})`;
    ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
  }
  ctx.restore();
};

const drawGuide = (ctx: CanvasRenderingContext2D, guide: GuideDraw, cueX: number, cueY: number, view: View) => {
  const { aim, alpha } = guide;
  const power = guide.power ?? 0.5;
  const s = view.s;
  const px = (x: number) => view.ox + x * s;
  const py = (y: number) => view.oy + y * s;
  const dx = aim.gx - cueX;
  const dy = aim.gy - cueY;
  const dl = Math.hypot(dx, dy) || 1;
  const ux = dx / dl;
  const uy = dy / dl;
  // Bashorat chiziqlari kuch bilan uzayadi — kuchli zarba uzoqqa olib boradi
  const reach = 0.55 + 0.75 * power;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.setLineDash([0.55 * s, 0.5 * s]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = Math.max(1, 0.09 * s);
  ctx.beginPath();
  ctx.moveTo(px(cueX + ux * R * 1.1), py(cueY + uy * R * 1.1));
  ctx.lineTo(px(aim.gx - ux * R), py(aim.gy - uy * R));
  ctx.stroke();

  // "Arvoh shar" — biток urilish paytida turadigan joy (uzuq-uzuq kontur)
  ctx.beginPath();
  ctx.arc(px(aim.gx), py(aim.gy), R * s, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fill();
  ctx.setLineDash([0.32 * s, 0.22 * s]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = Math.max(1, 0.08 * s);
  ctx.stroke();
  ctx.setLineDash([]);

  const ray = (x: number, y: number, rx: number, ry: number, length: number, color: string, head: boolean) => {
    const ex = x + rx * length;
    const ey = y + ry * length;
    const g = ctx.createLinearGradient(px(x), py(y), px(ex), py(ey));
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1.2, 0.12 * s);
    ctx.beginPath();
    ctx.moveTo(px(x), py(y));
    ctx.lineTo(px(ex), py(ey));
    ctx.stroke();
    if (!head) return;
    // Yo'nalish "o'qi" — chiziq boshida kichik uchburchak
    const hx = px(x + rx * 1.6);
    const hy = py(y + ry * 1.6);
    const w = 0.32 * s;
    ctx.beginPath();
    ctx.moveTo(hx + rx * w * 1.5, hy + ry * w * 1.5);
    ctx.lineTo(hx - ry * w, hy + rx * w);
    ctx.lineTo(hx + ry * w, hy - rx * w);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  if (aim.target) {
    // Tegish nuqtasi — ikki shar uchrashadigan joy
    ctx.beginPath();
    ctx.arc(px(aim.gx + aim.objX * R), py(aim.gy + aim.objY * R), Math.max(1.5, 0.16 * s), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
    ray(aim.target.x, aim.target.y, aim.objX, aim.objY, (2.5 + 9 * aim.objShare) * reach, 'rgba(242, 237, 225, 0.8)', true);
    const path = cuePathAfterContact(aim, ux, uy, guide.vertical ?? 0);
    if (path.share > 0.05) {
      ray(aim.gx, aim.gy, path.x, path.y, (1.5 + 6 * path.share) * reach, 'rgba(230, 110, 95, 0.75)', false);
    }
  } else {
    ray(aim.gx, aim.gy, aim.cueX, aim.cueY, 5 * reach, 'rgba(255, 255, 255, 0.4)', false);
  }
  ctx.restore();
};

/** Kuch halqasi: zumrad → oltin → qizil, foiz yozuvi va 100% da yog'du */
const drawPower = (ctx: CanvasRenderingContext2D, p: PowerDraw, view: View) => {
  const s = view.s;
  const cx = view.ox + p.x * s;
  const cy = view.oy + p.y * s;
  const r = 2.35 * R * s;
  const width = Math.max(3, 0.34 * s);
  // Halqa uzilishi kiy tomonida — kiy halqani kesib o'tmasin
  const back = Math.atan2(-p.dirY, -p.dirX);
  const gap = 1.1;
  const start = back + gap / 2;
  const sweep = Math.PI * 2 - gap;
  const value = Math.min(1, Math.max(0, p.value));

  ctx.save();
  ctx.globalAlpha = p.armed ? 1 : 0.35;
  ctx.lineCap = 'round';
  // Yo'lak: qorong'i "o'yiq" va ustida xira chiziq
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, start + sweep);
  ctx.strokeStyle = 'rgba(6, 10, 8, 0.6)';
  ctx.lineWidth = width + 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
  ctx.lineWidth = width;
  ctx.stroke();

  // To'lgan qism — har bo'lak o'z kuch rangida (gradient barcha brauzerda ishlasin)
  const full = value >= 0.999;
  if (full) {
    ctx.shadowColor = rgba(BRAND.semantic.error, 0.85);
    ctx.shadowBlur = (10 + 8 * p.pulse) * (view.dpr > 1 ? 1 : 0.8);
  }
  const pieces = Math.max(2, Math.ceil(56 * value));
  for (let i = 0; i < pieces; i++) {
    const a0 = start + (sweep * value * i) / pieces;
    const a1 = start + (sweep * value * (i + 1)) / pieces;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1 + (i < pieces - 1 ? 0.02 : 0));
    ctx.strokeStyle = powerColor((value * (i + 0.5)) / pieces);
    ctx.lineWidth = width;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Foiz — halqa ustida (stol cheti yaqin bo'lsa ostida)
  const fontSize = Math.round(Math.min(15, Math.max(11, 1.35 * s)));
  const above = cy - r - fontSize * 1.1 > view.oy - 2 * s;
  const ty = above ? cy - r - fontSize * 0.75 : cy + r + fontSize * 0.95;
  const label = `${Math.round(value * 100)}%`;
  ctx.font = `750 ${fontSize}px ${BALL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(4, 8, 6, 0.85)';
  ctx.strokeText(label, cx, ty);
  ctx.fillStyle = full ? mix(BRAND.semantic.error, '#ffffff', 0.25 + 0.25 * p.pulse) : powerColor(value);
  ctx.fillText(label, cx, ty);
  ctx.restore();
};

/** Zarba chaqnashi (kuchga mutanosib) va tushgan soqqa ustidagi "+1" */
const drawEffects = (ctx: CanvasRenderingContext2D, fx: EffectsDraw, view: View) => {
  const s = view.s;
  ctx.save();
  for (const f of fx.flashes) {
    const k = (fx.now - f.at) / FLASH_MS;
    if (k < 0 || k >= 1) continue;
    const cx = view.ox + f.x * s;
    const cy = view.oy + f.y * s;
    const ease = 1 - (1 - k) ** 3;
    ctx.beginPath();
    ctx.arc(cx, cy, (0.5 + (1.2 + 1.4 * f.power) * ease) * R * s, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 244, 214, ${(1 - k) * (0.25 + 0.5 * f.power)})`;
    ctx.lineWidth = Math.max(1, (0.22 - 0.15 * k) * s);
    ctx.stroke();
  }
  const fontSize = Math.round(Math.min(18, Math.max(12, 1.7 * s)));
  ctx.font = `800 ${fontSize}px ${BALL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const p of fx.pops) {
    const k = (fx.now - p.at) / POP_MS;
    if (k < 0 || k >= 1) continue;
    const rise = (1 - (1 - k) ** 2) * 2.2 * R;
    const x = view.ox + (p.x + p.dx * (1.6 * R + rise)) * s;
    const y = view.oy + (p.y + p.dy * (1.6 * R + rise)) * s;
    ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(8, 10, 9, 0.85)';
    ctx.strokeText(p.text, x, y);
    ctx.fillStyle = BRAND.gold.hover;
    ctx.fillText(p.text, x, y);
  }
  ctx.restore();
};

const drawCue = (ctx: CanvasRenderingContext2D, pose: CuePose, table: Table, view: View) => {
  const { gold, wood } = BRAND;
  const s = view.s;
  const ux = pose.dirX;
  const uy = pose.dirY;
  const length = table.L * 0.66;
  const tipD = (R + pose.gap) * s;
  const tx = view.ox + pose.x * s - ux * tipD;
  const ty = view.oy + pose.y * s - uy * tipD;
  const bx = tx - ux * length * s;
  const by = ty - uy * length * s;
  const pxv = -uy;
  const pyv = ux;
  const tipW = 0.24 * R * s;
  const buttW = 0.56 * R * s;
  const shape = (ox: number, oy: number, grow: number) =>
    polygon(ctx, [
      [tx + ox + (pxv * (tipW + grow)) / 2, ty + oy + (pyv * (tipW + grow)) / 2],
      [bx + ox + (pxv * (buttW + grow)) / 2, by + oy + (pyv * (buttW + grow)) / 2],
      [bx + ox - (pxv * (buttW + grow)) / 2, by + oy - (pyv * (buttW + grow)) / 2],
      [tx + ox - (pxv * (tipW + grow)) / 2, ty + oy - (pyv * (tipW + grow)) / 2],
    ]);

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, pose.alpha));
  // Soya — matoga tushgan, biroz yoyilgan
  for (const [grow, a] of [[0.9 * s, 0.1], [0.35 * s, 0.16]] as const) {
    shape(0.9 * s, 1.3 * s, grow);
    ctx.fillStyle = `rgba(0, 0, 0, ${a})`;
    ctx.fill();
  }

  shape(0, 0, 0);
  const g = ctx.createLinearGradient(tx, ty, bx, by);
  g.addColorStop(0, '#4f7cc4');
  g.addColorStop(0.012, '#4f7cc4');
  g.addColorStop(0.013, '#efe8d8');
  g.addColorStop(0.03, '#efe8d8');
  g.addColorStop(0.031, '#efd9a8');
  g.addColorStop(0.56, '#d8b679');
  g.addColorStop(0.57, gold.base);
  g.addColorStop(0.585, gold.base);
  g.addColorStop(0.586, '#141010');
  g.addColorStop(0.6, '#141010');
  g.addColorStop(0.601, wood.light);
  g.addColorStop(0.7, wood.base);
  g.addColorStop(0.71, '#c49a5a');
  g.addColorStop(0.725, '#c49a5a');
  g.addColorStop(0.726, wood.dark);
  g.addColorStop(0.97, '#1c0f07');
  g.addColorStop(0.971, '#0b0b0b');
  g.addColorStop(1, '#0b0b0b');
  ctx.fillStyle = g;
  ctx.fill();

  // Silindr hajmi: bir chekkasi yorug', ikkinchisi soyada
  const side = ctx.createLinearGradient(
    tx + (pxv * buttW) / 2,
    ty + (pyv * buttW) / 2,
    tx - (pxv * buttW) / 2,
    ty - (pyv * buttW) / 2,
  );
  side.addColorStop(0, 'rgba(255, 255, 255, 0.32)');
  side.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
  side.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  shape(0, 0, 0);
  ctx.fillStyle = side;
  ctx.fill();
  ctx.restore();
};

export const drawScene = (
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  world: World,
  view: View,
  overlay: {
    guide: GuideDraw | null;
    cue: CuePose | null;
    cueX: number;
    cueY: number;
    power?: PowerDraw | null;
    effects?: EffectsDraw | null;
  },
): void => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(layer, 0, 0);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawShadows(ctx, world, view);
  if (overlay.guide) drawGuide(ctx, overlay.guide, overlay.cueX, overlay.cueY, view);
  // Avval teshikka tushayotganlar — ular boshqalar ostida ko'rinsin
  for (const b of world.balls) if (b.phase === 'sinking') drawBall(ctx, b, world, view);
  for (const b of world.balls) if (b.phase === 'live') drawBall(ctx, b, world, view);
  if (overlay.power) drawPower(ctx, overlay.power, view);
  if (overlay.cue) drawCue(ctx, overlay.cue, world.table, view);
  if (overlay.effects) drawEffects(ctx, overlay.effects, view);
};
