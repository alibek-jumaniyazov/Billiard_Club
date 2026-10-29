/**
 * Billiard stolini chizish (canvas 2D) — protsedural, tashqi rasmsiz.
 *
 * Ikki qatlam:
 *  · STATIK (buildTableLayer) — yog'och korpus, bortlar, mato, teshiklar.
 *    O'lcham o'zgargandagina bir marta chiziladi va keshlanadi;
 *  · DINAMIK (drawScene) — har kadrda faqat soyalar, sharlar, mo'ljal va kiy.
 *
 * Yorug'lik: stol markazi ustida bitta lampa. Soyalar undan uzoqqa cho'ziladi,
 * shardagi yaltiroq nuqta lampaga qarab siljiydi — haqiqiy zal kabi.
 */
import { TOKENS } from '../../../theme/tokens';
import { R, rotateByQuat, type AimInfo, type Ball, type Table, type World } from './physics';

export const IVORY = '#f2ede1';
export const CUE_RED = '#c8372b';
const INK = '#2b2219';
const BALL_FONT = "'Inter Variable', 'Segoe UI', Roboto, sans-serif";
/** Lampa balandligi (R birligida) — soya uzunligi shundan */
const LAMP_H = 36;

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
}

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

/* ------------------------------------------------------- Statik qatlam */

export const buildTableLayer = (table: Table, view: View): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(view.w * view.dpr));
  canvas.height = Math.max(1, Math.round(view.h * view.dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const { emerald, wood, gold } = TOKENS.color;
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

  // 5) Teshik atrofidagi charm (bort ustida)
  for (const p of table.pockets) {
    const rim = p.hole + 0.75;
    const g = ctx.createRadialGradient(p.x - 0.4, p.y - 0.5, 0.2, p.x, p.y, rim);
    g.addColorStop(0, '#3e2b1d');
    g.addColorStop(0.7, '#24170f');
    g.addColorStop(1, '#140c07');
    ctx.beginPath();
    ctx.arc(p.x, p.y, rim, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = rgba(gold.base, 0.25);
    ctx.lineWidth = 0.05;
    ctx.stroke();
  }

  // 6) Mato — lampa ostida iliq yorug', chetga qarab to'qlashadi
  const lit = mix(emerald.base, '#fff1d2', 0.16);
  const felt = ctx.createRadialGradient(L / 2, B / 2, 0, L / 2, B / 2, L * 0.62);
  felt.addColorStop(0, lit);
  felt.addColorStop(0.45, emerald.base);
  felt.addColorStop(0.8, emerald.felt);
  felt.addColorStop(1, emerald.deep);
  ctx.fillStyle = felt;
  ctx.fillRect(-c, -c, L + 2 * c, B + 2 * c);

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
  const tile = noiseTile(128);
  const pattern = ctx.createPattern(tile, 'repeat');
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

  // 12) Teshiklar — chuqur qora, chetida charm soyasi
  for (const p of table.pockets) {
    const g = ctx.createRadialGradient(p.x, p.y, 0.1, p.x, p.y, p.hole);
    g.addColorStop(0, '#000');
    g.addColorStop(0.72, '#060403');
    g.addColorStop(1, '#1d140e');
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.hole, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.hole - 0.08, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.lineWidth = 0.16;
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
  const { L, B } = world.table;
  for (const b of world.balls) {
    if (b.phase === 'gone') continue;
    const fade = b.phase === 'sinking' ? 1 - b.sink : 1;
    const rr = R * view.s * ballScale(b);
    const cx = view.ox + b.x * view.s;
    const cy = view.oy + b.y * view.s;
    // Lampa markaz ustida: soya undan uzoqqa, masofaga mutanosib cho'ziladi
    const offX = ((b.x - L / 2) * R) / (LAMP_H - R);
    const offY = ((b.y - B / 2) * R) / (LAMP_H - R);
    const off = Math.hypot(offX, offY);
    ctx.save();
    ctx.translate(cx + offX * view.s, cy + offY * view.s + rr * 0.1);
    ctx.rotate(Math.atan2(offY, offX));
    ctx.scale(1 + off * 0.55, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr * 1.2);
    g.addColorStop(0, `rgba(0, 0, 0, ${0.5 * fade})`);
    g.addColorStop(0.55, `rgba(0, 0, 0, ${0.3 * fade})`);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rr * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
  const { emerald } = TOKENS.color;
  const rr = R * view.s * ballScale(b);
  if (rr < 0.5) return;
  const cx = view.ox + b.x * view.s;
  const cy = view.oy + b.y * view.s;
  const cue = b.id === 0;

  // Yaltiroq nuqta: lampa va ko'z orasidagi yarim vektor + ozgina badiiy siljish
  const lx = L / 2 - b.x;
  const ly = B / 2 - b.y;
  const len = Math.hypot(lx, ly, LAMP_H);
  const hx0 = lx / len;
  const hy0 = ly / len;
  const hz0 = LAMP_H / len + 1;
  const hl = Math.hypot(hx0, hy0, hz0);
  const hx = cx + ((hx0 / hl) * 0.9 - 0.22) * rr;
  const hy = cy + ((hy0 / hl) * 0.9 - 0.3) * rr;

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

  // Lampa aksi (specular)
  const spec = ctx.createRadialGradient(hx, hy, 0, hx, hy, rr * 0.32);
  spec.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  spec.addColorStop(0.35, 'rgba(255, 255, 255, 0.35)');
  spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = spec;
  ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);

  if (b.phase === 'sinking') {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.75 * b.sink})`;
    ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
  }
  ctx.restore();
};

const drawGuide = (ctx: CanvasRenderingContext2D, guide: GuideDraw, cueX: number, cueY: number, view: View) => {
  const { aim, alpha } = guide;
  const s = view.s;
  const px = (x: number) => view.ox + x * s;
  const py = (y: number) => view.oy + y * s;
  const dx = aim.gx - cueX;
  const dy = aim.gy - cueY;
  const dl = Math.hypot(dx, dy) || 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.setLineDash([0.55 * s, 0.5 * s]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = Math.max(1, 0.09 * s);
  ctx.beginPath();
  ctx.moveTo(px(cueX + (dx / dl) * R * 1.1), py(cueY + (dy / dl) * R * 1.1));
  ctx.lineTo(px(aim.gx - (dx / dl) * R), py(aim.gy - (dy / dl) * R));
  ctx.stroke();
  ctx.setLineDash([]);

  // "Arvoh shar" — biток urilish paytida turadigan joy
  ctx.beginPath();
  ctx.arc(px(aim.gx), py(aim.gy), R * s, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = Math.max(1, 0.07 * s);
  ctx.stroke();

  const ray = (x: number, y: number, ux: number, uy: number, length: number, color: string) => {
    const g = ctx.createLinearGradient(px(x), py(y), px(x + ux * length), py(y + uy * length));
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1.2, 0.12 * s);
    ctx.beginPath();
    ctx.moveTo(px(x), py(y));
    ctx.lineTo(px(x + ux * length), py(y + uy * length));
    ctx.stroke();
  };
  if (aim.target) {
    ray(aim.target.x, aim.target.y, aim.objX, aim.objY, 2.5 + 9 * aim.objShare, 'rgba(242, 237, 225, 0.75)');
    if (aim.cueShare > 0.05) {
      ray(aim.gx, aim.gy, aim.cueX, aim.cueY, 1.5 + 6 * aim.cueShare, 'rgba(230, 110, 95, 0.7)');
    }
  } else {
    ray(aim.gx, aim.gy, aim.cueX, aim.cueY, 5, 'rgba(255, 255, 255, 0.4)');
  }
  ctx.restore();
};

const drawCue = (ctx: CanvasRenderingContext2D, pose: CuePose, table: Table, view: View) => {
  const { gold, wood } = TOKENS.color;
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
  overlay: { guide: GuideDraw | null; cue: CuePose | null; cueX: number; cueY: number },
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
  if (overlay.cue) drawCue(ctx, overlay.cue, world.table, view);
};
