/**
 * RUS BILYARDI fizikasi — DOM'siz, toza TypeScript (vitest bilan tekshiriladi).
 *
 * Birliklar: uzunlik — shar radiusi (R = 1), vaqt — soniya. Stol o'lchami
 * ekranga bog'liq EMAS: renderer dunyoni piksellarga o'zi masshtablaydi,
 * shuning uchun bir xil zarba har qanday ekranda bir xil natija beradi.
 *
 * Koordinatalar: x — o'ngga, y — pastga (canvas kabi), z — stol ICHIGA.
 * Bu o'ng qo'l sistemasi: ω × r formulalari shu bilan to'g'ri ishlaydi;
 * ko'ruvchiga sharning z < 0 yarmi ko'rinadi.
 *
 * Model:
 *  · sirpanish → dumalash: tegish nuqtasi matoga nisbatan sirpansa kuchli
 *    ishqalanish (μ≈0.2) uni nolga keltiradi, keyin faqat kichik dumalash
 *    qarshiligi (μ≈0.016) qoladi. O'tish aniq hisoblanadi (qadam ichida);
 *  · shar–shar: teng massali impuls (e≈0.94) + cheklangan ishqalanish (throw);
 *  · bort: tezlikka bog'liq restitutsiya (sekin 0.82 → tez 0.70), vint
 *    (vertikal o'q atrofidagi aylanish) qaytish burchagini o'zgartiradi;
 *  · teshik — magnit EMAS: og'iz bo'shlig'i va jag'lar (segment uchlari)
 *    orqali shar faqat markazi teshik ichiga yetsa tushadi, aks holda qaytadi.
 */

export const R = 1;
/** Shar inersiya momenti (m = 1): I = 2/5·m·R² */
const INERTIA = 0.4 * R * R;
/** Erkin tushish tezlanishi, R/s² (g = 9.81 m/s², R = 34 mm → 288.5) */
export const G = 288.5;

export const PHYS = {
  /** Belgilangan fizika qadami — natija kadr tezligiga bog'liq bo'lmasin */
  dt: 1 / 240,
  muSlide: 0.2,
  muRoll: 0.016,
  /** Vint (z o'qi) so'nishi, rad/s² */
  spinDecay: 14,
  eBall: 0.94,
  muBall: 0.06,
  eCushionSlow: 0.82,
  eCushionFast: 0.7,
  cushionRefSpeed: 100,
  muCushion: 0.14,
  maxSpeed: 125,
  /** Bundan sekin shar "to'xtagan" hisoblanadi */
  restSpeed: 0.02,
} as const;

/** Bir substepda shar bosib o'tadigan eng katta yo'l — tunnel bo'lmasin */
const MAX_TRAVEL = 0.2 * R;
const SINK_TIME = 0.28;

/* ------------------------------------------------------------------ Turlar */

export type Quat = [number, number, number, number];

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface Pocket {
  x: number;
  y: number;
  corner: boolean;
  /** Markaz shu masofaga yetsa shar tushadi */
  capture: number;
  /** Rasm uchun teshik radiusi */
  hole: number;
  /** AI mo'ljal nuqtasi — og'iz o'rtasi */
  aimX: number;
  aimY: number;
}

export interface Table {
  /** O'yin maydoni (bort tumshuqlari orasida) */
  L: number;
  B: number;
  cushion: number;
  rail: number;
  /** Burchak og'zi — bort uchidan maydon burchagigacha */
  cornerMouth: number;
  /** O'rta og'iz yarim kengligi */
  sideMouth: number;
  /** Og'iz yuzalarining (facing) bort orqasidagi siljishi */
  cornerFacing: number;
  sideFacing: number;
  segments: Segment[];
  pockets: Pocket[];
  /** "Uy" chizig'i va piramida cho'qqisi nuqtasi */
  headX: number;
  footX: number;
  /** Butun stol yog'och bilan — renderer shu to'rtburchakni ekranga sig'diradi */
  outerW: number;
  outerH: number;
}

export type BallPhase = 'live' | 'sinking' | 'gone';

export interface Ball {
  /** 0 — biток (cue), 1..15 — raqamli soqqalar */
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Burchak tezligi (dunyo o'qlarida), rad/s */
  wx: number;
  wy: number;
  wz: number;
  /** Yo'nalish — raqam "dekali" dumalaganda shu bilan buriladi */
  q: Quat;
  phase: BallPhase;
  sink: number;
  pocket: number;
}

export interface World {
  table: Table;
  balls: Ball[];
  time: number;
  /** Oxirgi zarbadan beri tushgan sharlar */
  pocketed: number[];
  /** Piramida terilgandan beri zarbalar soni (0 — razbiy kutilmoqda) */
  shots: number;
}

/* --------------------------------------------------------- Yordamchilar */

/** Determinik tasodif (mulberry32) — testlar va AI takrorlanuvchan bo'lsin */
export const createRng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** q' = q + ½·(ω ⊗ q)·h, keyin normallash */
const integrateQuat = (q: Quat, wx: number, wy: number, wz: number, h: number): void => {
  const [qw, qx, qy, qz] = q;
  const k = 0.5 * h;
  const nw = qw + k * (-wx * qx - wy * qy - wz * qz);
  const nx = qx + k * (wx * qw + wy * qz - wz * qy);
  const ny = qy + k * (-wx * qz + wy * qw + wz * qx);
  const nz = qz + k * (wx * qy - wy * qx + wz * qw);
  const len = Math.hypot(nw, nx, ny, nz) || 1;
  q[0] = nw / len;
  q[1] = nx / len;
  q[2] = ny / len;
  q[3] = nz / len;
};

/** Vektorni kvaternion bilan aylantirish (v' = q·v·q*) */
export const rotateByQuat = (q: Quat, vx: number, vy: number, vz: number): [number, number, number] => {
  const [w, x, y, z] = q;
  // t = 2·(q.xyz × v)
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
};

/** Tegish nuqtasining matoga nisbatan tezligi: u = v + ω × (0,0,R) */
const slip = (b: Ball): [number, number] => [b.vx + R * b.wy, b.vy - R * b.wx];

export const speedOf = (b: Ball): number => Math.hypot(b.vx, b.vy);

/* ------------------------------------------------------------------ Stol */

export const createTable = (): Table => {
  const L = 50;
  const B = 26;
  const cushion = 1.5;
  const rail = 3.2;
  // Og'izlar haqiqiy rus stolidan biroz keng (namoyish o'yini zerikarli bo'lmasin),
  // lekin magnitsiz: shar baribir og'izga aniq kirishi kerak
  const cm = 2.3;
  const sm = 2.05;
  const kc = cushion * 1.12;
  const ks = cushion * 0.35;
  const c = cushion;

  const seg = (ax: number, ay: number, bx: number, by: number): Segment => ({ ax, ay, bx, by });
  const segments: Segment[] = [
    // Bort tumshuqlari (yuqori/pastki — o'rta teshik bilan ikkiga bo'lingan)
    seg(cm, 0, L / 2 - sm, 0),
    seg(L / 2 + sm, 0, L - cm, 0),
    seg(cm, B, L / 2 - sm, B),
    seg(L / 2 + sm, B, L - cm, B),
    seg(0, cm, 0, B - cm),
    seg(L, cm, L, B - cm),
    // Burchak og'zi yuzalari (facing) — teshik tomon torayadi, "rattle" shu yerda
    seg(cm, 0, cm - kc, -c),
    seg(0, cm, -c, cm - kc),
    seg(L - cm, 0, L - cm + kc, -c),
    seg(L, cm, L + c, cm - kc),
    seg(cm, B, cm - kc, B + c),
    seg(0, B - cm, -c, B - cm + kc),
    seg(L - cm, B, L - cm + kc, B + c),
    seg(L, B - cm, L + c, B - cm + kc),
    // O'rta og'iz yuzalari
    seg(L / 2 - sm, 0, L / 2 - sm + ks, -c),
    seg(L / 2 + sm, 0, L / 2 + sm - ks, -c),
    seg(L / 2 - sm, B, L / 2 - sm + ks, B + c),
    seg(L / 2 + sm, B, L / 2 + sm - ks, B + c),
  ];

  const corner = (x: number, y: number, ax: number, ay: number): Pocket => ({
    x,
    y,
    corner: true,
    capture: 2.05,
    hole: 1.95,
    aimX: ax,
    aimY: ay,
  });
  const mouth = cm * 0.38;
  const pockets: Pocket[] = [
    corner(-0.5 * c, -0.5 * c, mouth, mouth),
    corner(L + 0.5 * c, -0.5 * c, L - mouth, mouth),
    corner(-0.5 * c, B + 0.5 * c, mouth, B - mouth),
    corner(L + 0.5 * c, B + 0.5 * c, L - mouth, B - mouth),
    // O'rta teshik markazi bort orqasida chuqurroq: bort bo'ylab dumalayotgan
    // shar uning ustidan o'tib ketadi, teshikka QARAB kelgani esa tushadi
    { x: L / 2, y: -1.1, corner: false, capture: 1.95, hole: 1.7, aimX: L / 2, aimY: 0.3 },
    { x: L / 2, y: B + 1.1, corner: false, capture: 1.95, hole: 1.7, aimX: L / 2, aimY: B - 0.3 },
  ];

  return {
    L,
    B,
    cushion,
    rail,
    cornerMouth: cm,
    sideMouth: sm,
    cornerFacing: kc,
    sideFacing: ks,
    segments,
    pockets,
    headX: L * 0.25,
    footX: L * 0.73,
    outerW: L + 2 * (cushion + rail),
    outerH: B + 2 * (cushion + rail),
  };
};

/* -------------------------------------------------------------- Dunyo */

const newBall = (id: number, x: number, y: number): Ball => ({
  id,
  x,
  y,
  vx: 0,
  vy: 0,
  wx: 0,
  wy: 0,
  wz: 0,
  // Terilgan sharlar raqami tepaga qaragan (dekal ko'ruvchi tomonda)
  q: [1, 0, 0, 0],
  phase: 'live',
  sink: 0,
  pocket: -1,
});

/** Piramidani terish: cho'qqi orqa nuqtada, 15 soqqa + "uy"dagi biток */
export const rackBalls = (world: World, rng: () => number = Math.random): void => {
  const { footX, headX, B } = world.table;
  const gap = 0.02;
  const dx = Math.sqrt(3) * R + gap;
  const dy = 2 * R + gap;
  const balls: Ball[] = [];
  let n = 1;
  for (let col = 0; col < 5; col++) {
    for (let i = 0; i <= col; i++) {
      balls.push(newBall(n++, footX + col * dx, B / 2 + (i - col / 2) * dy));
    }
  }
  balls.push(newBall(0, headX * 0.82, B / 2 + (rng() - 0.5) * 3));
  world.balls = balls;
  world.pocketed = [];
  world.shots = 0;
};

export const createWorld = (rng: () => number = Math.random): World => {
  const world: World = { table: createTable(), balls: [], time: 0, pocketed: [], shots: 0 };
  rackBalls(world, rng);
  return world;
};

export const cueBall = (world: World): Ball | undefined =>
  world.balls.find((b) => b.id === 0 && b.phase === 'live');

/** Tushgan biткни "uy"ga qaytarish — bo'sh joy topilguncha siljitib */
export const respawnCue = (world: World): void => {
  const { headX, B } = world.table;
  let cue = world.balls.find((b) => b.id === 0);
  if (!cue) {
    cue = newBall(0, 0, 0);
    world.balls.push(cue);
  }
  const free = (x: number, y: number) =>
    world.balls.every((o) => o === cue || o.phase !== 'live' || Math.hypot(o.x - x, o.y - y) > 2 * R + 0.1);
  const spots: [number, number][] = [];
  for (let ring = 0; ring < 6; ring++) {
    for (let k = -ring; k <= ring; k++) spots.push([headX * 0.82 - ring * 0.8, B / 2 + k * 2.4]);
  }
  const [x, y] = spots.find(([sx, sy]) => sy > R + 0.2 && sy < B - R - 0.2 && free(sx, sy)) ?? [headX * 0.5, B / 2];
  Object.assign(cue, newBall(0, x, y));
};

/**
 * Biтокка zarba.
 * @param side    gorizontal siljish (−0.6…0.6 R): o'ngga (+) — vint, bortdan o'ngga qaytadi
 * @param vertical vertikal siljish (−0.6…0.6 R): + — накат (follow), − — оттяжка (draw)
 */
export const strike = (
  world: World,
  dirX: number,
  dirY: number,
  speed: number,
  side = 0,
  vertical = 0,
): void => {
  const cue = cueBall(world);
  if (!cue) return;
  const len = Math.hypot(dirX, dirY) || 1;
  const dx = dirX / len;
  const dy = dirY / len;
  const v = clamp(speed, 0, PHYS.maxSpeed);
  const a = clamp(side, -0.6, 0.6);
  const b = clamp(vertical, -0.6, 0.6);
  cue.vx = dx * v;
  cue.vy = dy * v;
  // Burchak impulsi L = r × p: tabiiy dumalash yo'nalishi (dy, −dx)·v/R,
  // b = 0.4R zarbada shar darhol dumalaydi (накат), b < 0 — teskari aylanish
  const spin = (2.5 * v * b) / (R * R);
  cue.wx = dy * spin;
  cue.wy = -dx * spin;
  cue.wz = (-2.5 * v * a) / (R * R);
  world.pocketed = [];
  world.shots += 1;
};

/* --------------------------------------------------------- To'qnashuvlar */

const cushionRestitution = (vn: number): number => {
  const k = clamp(vn / PHYS.cushionRefSpeed, 0, 1);
  return PHYS.eCushionSlow - (PHYS.eCushionSlow - PHYS.eCushionFast) * k;
};

/**
 * Shar–bort (yoki jag') to'qnashuvi. Segment "kapsula" sifatida qaraladi:
 * eng yaqin nuqta segment uchiga tushsa — bu jag' (pocket point).
 * @returns tegdimi
 */
export const collideSegment = (b: Ball, s: Segment): boolean => {
  const ex = s.bx - s.ax;
  const ey = s.by - s.ay;
  const l2 = ex * ex + ey * ey || 1;
  const t = clamp(((b.x - s.ax) * ex + (b.y - s.ay) * ey) / l2, 0, 1);
  const cx = s.ax + ex * t;
  const cy = s.ay + ey * t;
  let nx = b.x - cx;
  let ny = b.y - cy;
  const d = Math.hypot(nx, ny);
  if (d >= R || d < 1e-9) return false;
  nx /= d;
  ny /= d;
  b.x = cx + nx * R;
  b.y = cy + ny * R;
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return true;
  const jn = -(1 + cushionRestitution(-vn)) * vn;
  b.vx += jn * nx;
  b.vy += jn * ny;
  // Bort bo'ylab ishqalanish: tegish nuqtasi sirpanishi = v·t − R·ωz.
  // Impuls "yopishish" chegarasidan oshmaydi — energiya hech qachon ortmaydi
  const tx = -ny;
  const ty = nx;
  const vt = b.vx * tx + b.vy * ty - R * b.wz;
  const p = Math.sign(vt) * Math.min(Math.abs(vt) / 3.5, PHYS.muCushion * jn);
  b.vx -= p * tx;
  b.vy -= p * ty;
  b.wz += (R * p) / INERTIA;
  return true;
};

/**
 * Shar–shar to'qnashuvi (teng massa). Pozitsion tuzatish + normal impuls
 * (faqat yaqinlashayotgan bo'lsa) + cheklangan urinma ishqalanish (throw).
 * @returns tegdimi
 */
export const collideBalls = (a: Ball, b: Ball): boolean => {
  let nx = b.x - a.x;
  let ny = b.y - a.y;
  const d = Math.hypot(nx, ny);
  const min = 2 * R;
  if (d >= min) return false;
  if (d < 1e-9) {
    nx = 1;
    ny = 0;
  } else {
    nx /= d;
    ny /= d;
  }
  const push = (min - d) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;

  const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (vn <= 0) return true;
  const jn = ((1 + PHYS.eBall) * vn) / 2;
  a.vx -= jn * nx;
  a.vy -= jn * ny;
  b.vx += jn * nx;
  b.vy += jn * ny;

  const tx = -ny;
  const ty = nx;
  const vt = (a.vx - b.vx) * tx + (a.vy - b.vy) * ty + R * (a.wz + b.wz);
  const p = Math.sign(vt) * Math.min(Math.abs(vt) / 7, PHYS.muBall * jn);
  a.vx -= p * tx;
  a.vy -= p * ty;
  b.vx += p * tx;
  b.vy += p * ty;
  a.wz -= (p * R) / INERTIA;
  b.wz -= (p * R) / INERTIA;
  return true;
};

/* ------------------------------------------------------------ Integratsiya */

/** Mato ishqalanishi: sirpanish (aniq o'tish bilan) → dumalash; vint so'nishi */
const integrateBall = (b: Ball, h: number): void => {
  let remaining = h;
  const [ux, uy] = slip(b);
  const uLen = Math.hypot(ux, uy);
  if (uLen > 1e-9) {
    const aS = PHYS.muSlide * G;
    // Sirpanishda u o'z yo'nalishini saqlab, (7/2)·μ·g tezlik bilan kamayadi
    const tRoll = uLen / (3.5 * aS);
    const t = Math.min(remaining, tRoll);
    const ix = ux / uLen;
    const iy = uy / uLen;
    b.x += (b.vx - 0.5 * aS * ix * t) * t;
    b.y += (b.vy - 0.5 * aS * iy * t) * t;
    b.vx -= aS * ix * t;
    b.vy -= aS * iy * t;
    b.wx += ((2.5 * aS * iy) / R) * t;
    b.wy -= ((2.5 * aS * ix) / R) * t;
    remaining -= t;
    if (t >= tRoll) {
      // Aynan dumalashga o'tdi — yaxlitlash qoldig'ini tozalaymiz
      b.wx = b.vy / R;
      b.wy = -b.vx / R;
    }
  }
  if (remaining > 0) {
    const s = Math.hypot(b.vx, b.vy);
    if (s > 0) {
      const aR = PHYS.muRoll * G;
      const t = Math.min(remaining, s / aR);
      const ix = b.vx / s;
      const iy = b.vy / s;
      b.x += (b.vx - 0.5 * aR * ix * t) * t;
      b.y += (b.vy - 0.5 * aR * iy * t) * t;
      const s2 = Math.max(0, s - aR * t);
      b.vx = ix * s2;
      b.vy = iy * s2;
    }
    b.wx = b.vy / R;
    b.wy = -b.vx / R;
  }
  if (b.wz !== 0) {
    const dec = PHYS.spinDecay * h;
    b.wz = Math.abs(b.wz) <= dec ? 0 : b.wz - Math.sign(b.wz) * dec;
  }
  if (Math.hypot(b.vx, b.vy) < PHYS.restSpeed) {
    const [sx, sy] = slip(b);
    if (Math.hypot(sx, sy) < PHYS.restSpeed) {
      b.vx = 0;
      b.vy = 0;
      b.wx = 0;
      b.wy = 0;
    }
  }
  integrateQuat(b.q, b.wx, b.wy, b.wz, h);
};

const capture = (world: World, b: Ball, index: number): void => {
  b.phase = 'sinking';
  b.pocket = index;
  b.sink = 0;
  world.pocketed.push(b.id);
};

const substep = (world: World, h: number): void => {
  const { table } = world;
  const live: Ball[] = [];
  for (const b of world.balls) {
    if (b.phase === 'sinking') {
      const p = table.pockets[b.pocket];
      const k = Math.min(1, h * 14);
      b.x += (p.x - b.x) * k;
      b.y += (p.y - b.y) * k;
      b.sink = Math.min(1, b.sink + h / SINK_TIME);
      if (b.sink >= 1) b.phase = 'gone';
      continue;
    }
    if (b.phase !== 'live') continue;
    integrateBall(b, h);
    live.push(b);
  }

  for (let i = live.length - 1; i >= 0; i--) {
    const b = live[i];
    let caught = -1;
    table.pockets.forEach((p, idx) => {
      if (caught < 0 && Math.hypot(b.x - p.x, b.y - p.y) < p.capture) caught = idx;
    });
    // Zaxira: bort ortiga sizib chiqqan shar eng yaqin teshikka tushadi
    const out =
      b.x < -table.cushion - 0.5 ||
      b.x > table.L + table.cushion + 0.5 ||
      b.y < -table.cushion - 0.5 ||
      b.y > table.B + table.cushion + 0.5;
    if (caught < 0 && out) {
      let best = Infinity;
      table.pockets.forEach((p, idx) => {
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        if (d < best) {
          best = d;
          caught = idx;
        }
      });
    }
    if (caught >= 0) {
      capture(world, b, caught);
      live.splice(i, 1);
    }
  }

  for (const b of live) {
    for (const s of table.segments) collideSegment(b, s);
  }

  // Zich piramida bir o'tishda to'liq ajralmaydi — kirishish qolmaguncha takror
  for (let iter = 0; iter < 8; iter++) {
    let worst = 0;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const c = live[j];
        const d = Math.hypot(c.x - a.x, c.y - a.y);
        if (d < 2 * R) {
          worst = Math.max(worst, 2 * R - d);
          collideBalls(a, c);
        }
      }
    }
    if (worst < 1e-4) break;
  }
};

/** Dunyoni `dt` soniyaga surish (odatda PHYS.dt) — tezlikka qarab substeplarga bo'linadi */
export const step = (world: World, dt: number = PHYS.dt): void => {
  let maxV = 0;
  for (const b of world.balls) if (b.phase === 'live') maxV = Math.max(maxV, speedOf(b));
  const n = Math.max(1, Math.ceil((maxV * dt) / MAX_TRAVEL));
  const h = dt / n;
  for (let i = 0; i < n; i++) substep(world, h);
  world.time += dt;
};

/** Hamma shar to'xtadimi (teshikka tushayotganlari ham tugaganmi) */
export const isSettled = (world: World): boolean =>
  world.balls.every((b) => {
    if (b.phase === 'sinking') return false;
    if (b.phase === 'gone') return true;
    const [ux, uy] = slip(b);
    return speedOf(b) < PHYS.restSpeed && Math.hypot(ux, uy) < PHYS.restSpeed;
  });

/** To'liq kinetik energiya (ilgarilanma + aylanma), m = 1 */
export const kineticEnergy = (world: World): number => {
  let e = 0;
  for (const b of world.balls) {
    if (b.phase !== 'live') continue;
    e += 0.5 * (b.vx * b.vx + b.vy * b.vy) + 0.5 * INERTIA * (b.wx * b.wx + b.wy * b.wy + b.wz * b.wz);
  }
  return e;
};

export const liveObjectBalls = (world: World): Ball[] =>
  world.balls.filter((b) => b.id !== 0 && b.phase === 'live');

/* ---------------------------------------------------------------- Mo'ljal */

export interface AimInfo {
  /** Biток markazi to'xtaydigan joy (ghost ball) */
  gx: number;
  gy: number;
  /** Yo'l uzunligi */
  dist: number;
  /** Urilgan soqqa (bo'lmasa — bort) */
  target: Ball | null;
  /** Soqqaning ketish yo'nalishi va ulushi (cosθ) */
  objX: number;
  objY: number;
  objShare: number;
  /** Biтокning burilish yo'nalishi (stun bo'yicha 90° qoidasi) */
  cueX: number;
  cueY: number;
  cueShare: number;
}

/** Biток yo'li bo'ylab birinchi to'siq — mo'ljal chizig'i va AI uchun */
export const castAim = (world: World, dirX: number, dirY: number): AimInfo | null => {
  const cue = cueBall(world);
  if (!cue) return null;
  const len = Math.hypot(dirX, dirY) || 1;
  const dx = dirX / len;
  const dy = dirY / len;

  let best = Infinity;
  let target: Ball | null = null;
  for (const o of world.balls) {
    if (o === cue || o.phase !== 'live') continue;
    const ox = o.x - cue.x;
    const oy = o.y - cue.y;
    const proj = ox * dx + oy * dy;
    if (proj <= 0) continue;
    const perp2 = ox * ox + oy * oy - proj * proj;
    const r2 = 4 * R * R;
    if (perp2 >= r2) continue;
    const t = proj - Math.sqrt(r2 - perp2);
    if (t < best) {
      best = t;
      target = o;
    }
  }

  // Bortgacha masofa — kichik qadam bilan "yurib" tekshiramiz (faqat mo'ljal paytida)
  const probe: Ball = { ...cue, q: [1, 0, 0, 0] };
  let wall = Infinity;
  const limit = Math.min(best, world.table.L * 1.5);
  for (let t = 0; t <= limit; t += 0.1) {
    probe.x = cue.x + dx * t;
    probe.y = cue.y + dy * t;
    const hit = world.table.segments.some((s) => {
      const ex = s.bx - s.ax;
      const ey = s.by - s.ay;
      const k = clamp(((probe.x - s.ax) * ex + (probe.y - s.ay) * ey) / (ex * ex + ey * ey || 1), 0, 1);
      return Math.hypot(probe.x - (s.ax + ex * k), probe.y - (s.ay + ey * k)) < R;
    });
    if (hit) {
      wall = Math.max(0, t - 0.1);
      break;
    }
  }

  if (target && best <= wall) {
    const gx = cue.x + dx * best;
    const gy = cue.y + dy * best;
    const nx = (target.x - gx) / (2 * R);
    const ny = (target.y - gy) / (2 * R);
    const cos = clamp(dx * nx + dy * ny, 0, 1);
    let cx = dx - cos * nx;
    let cy = dy - cos * ny;
    const cl = Math.hypot(cx, cy);
    if (cl > 1e-6) {
      cx /= cl;
      cy /= cl;
    }
    return {
      gx,
      gy,
      dist: best,
      target,
      objX: nx,
      objY: ny,
      objShare: cos,
      cueX: cx,
      cueY: cy,
      cueShare: Math.sqrt(Math.max(0, 1 - cos * cos)),
    };
  }
  if (!Number.isFinite(wall)) return null;
  const gx = cue.x + dx * wall;
  const gy = cue.y + dy * wall;
  // Bortdan qaytish yo'nalishi — eng yaqin segment normali bo'yicha
  let nx = 0;
  let ny = 0;
  let nearest = Infinity;
  for (const s of world.table.segments) {
    const ex = s.bx - s.ax;
    const ey = s.by - s.ay;
    const k = clamp(((gx - s.ax) * ex + (gy - s.ay) * ey) / (ex * ex + ey * ey || 1), 0, 1);
    const px = s.ax + ex * k;
    const py = s.ay + ey * k;
    const d = Math.hypot(gx - px, gy - py);
    if (d < nearest) {
      nearest = d;
      nx = (gx - px) / (d || 1);
      ny = (gy - py) / (d || 1);
    }
  }
  const dot = dx * nx + dy * ny;
  return {
    gx,
    gy,
    dist: wall,
    target: null,
    objX: 0,
    objY: 0,
    objShare: 0,
    cueX: dx - 2 * dot * nx,
    cueY: dy - 2 * dot * ny,
    cueShare: 0.6,
  };
};
