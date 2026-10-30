/**
 * BILLIARD CLUB — LOGO ANIMATSIYASI: "B" monogrammasi yig'iladi.
 *
 * Syujet (bazaviy tempda, soniya):
 *   0.08–0.62  stol chirog'i miltillab yonadi, mato yorishadi
 *   0.32–1.08  oltin inkrustatsiya chizig'i tepadan ikki tomonga chiziladi
 *   0.58–1.18  kiy pastdan ko'tarilib "B" ning o'zagiga aylanadi
 *   0.98–1.56  pastki shar o'ngdan dumalab kelib kiyga taqaladi
 *   1.22–1.82  ustki shar kelib, pastkisiga "chiq" etib tegadi
 *   1.88–2.50  belgi ustidan yorug'lik o'tadi
 *   1.98–2.95  belgi chetga suriladi, ortidan BILLIARD CLUB yozuvi chiqadi
 *
 * DETERMINISTIK: kadr faqat t ga bog'liq, ichki holat yo'q. Sayt va dastur
 * intro'si (components/brand/BrandIntro) ham, brend videolari
 * (tools/brand-video) ham aynan shu funksiyalar bilan chiziladi — video va
 * dastur ichidagi animatsiya bir xil.
 *
 * Geometriya va ranglar BrandLogo.tsx / favicon.svg bilan AYNAN bir xil
 * (48 birlik), shuning uchun oxirgi kadr sarlavhadagi logotipga choksiz
 * "qo'nadi".
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Surface = HTMLCanvasElement | OffscreenCanvas;

export type Span = readonly [number, number];

/* --------------------------------------------------------------- Geometriya */

export const MARK = {
  tile: { x: 1, y: 1, w: 46, h: 46, r: 12 },
  rim: { x: 2.8, y: 2.8, w: 42.4, h: 42.4, r: 10.2, width: 0.6 },
  cue: { x: 13.6, y: 8, w: 5, h: 32, r: 2.5, ferrule: 2.6, band: 0.5 },
  ballA: { x: 24.9, y: 15.5, r: 7.5 },
  ballB: { x: 25.9, y: 31.5, r: 8.5 },
} as const;

/** TOKENS.color bilan bir xil (bu fayl React/antd siz ham ishlashi kerak — video render) */
const COLOR = {
  bg: '9, 12, 11',
  feltLight: '#18774c',
  feltDeep: '#08261a',
  lampGreen: '35, 160, 102',
  gold: '#dbb35c',
  goldHover: '#e8c677',
  goldPale: '#f5dfa6',
  goldActive: '#bd954a',
  ivory: '#f3eee2',
  ivoryShade: '#c4b9a2',
  text: '#f1ece1',
  textMuted: '#b5ae9f',
} as const;

/** BrandLogo yozuvi: "BILLIARD " oq, "CLUB" oltin; harflar orasi 0.08em */
export const WORDMARK = { primary: 'BILLIARD', accent: 'CLUB', tracking: 0.08 } as const;

/* ------------------------------------------------------------------ Vaqt */

export interface Timeline {
  /** Chiroq yorug'i kalit kadrlari: [t, 0..1] — miltillash */
  lamp: ReadonlyArray<readonly [number, number]>;
  tile: Span;
  rim: Span;
  cue: Span;
  cueSheen: Span;
  ballB: Span;
  ballA: Span;
  sheen: Span;
  lockup: Span;
  word: Span;
}

export const TIMELINE: Timeline = {
  lamp: [
    [0, 0],
    [0.08, 0],
    [0.11, 0.55],
    [0.15, 0.1],
    [0.19, 0.72],
    [0.23, 0.28],
    [0.3, 0.93],
    [0.62, 1],
  ],
  tile: [0.05, 0.9],
  rim: [0.32, 1.08],
  cue: [0.58, 1.18],
  cueSheen: [1.04, 1.5],
  ballB: [0.98, 1.56],
  ballA: [1.22, 1.82],
  sheen: [1.88, 2.5],
  lockup: [1.98, 2.7],
  word: [2.04, 2.95],
};

/**
 * Belgi tayyor holatdan boshlanadi (Android: tizim splash ekranida aynan shu
 * belgi turgan edi) — faqat yorug'lik, yozuv va sarlavhaga uchish qoladi.
 */
export const ASSEMBLED_TIMELINE: Timeline = {
  lamp: [[0, 1]],
  tile: [-3, -2.9],
  rim: [-3, -2.9],
  cue: [-3, -2.9],
  cueSheen: [-3, -2.9],
  ballB: [-3, -2.9],
  ballA: [-3, -2.9],
  sheen: [0.06, 0.62],
  lockup: [0.16, 0.86],
  word: [0.22, 1.12],
};

/** Harflar orasidagi kechikish va bitta harfning chiqish vaqti */
const LETTER_STAGGER = 0.03;
const LETTER_DURATION = 0.45;
/**
 * Vertikal kompozitsiyada harflar belgining ostidan ko'tariladi — belgi yuqoriga
 * siljib ulgurmasa ular ustma-ust tushardi, shuning uchun biroz kechroq.
 */
const RISE_DELAY = 0.2;
/**
 * "behind": yozuv bir butun lenta bo'lib belgi ortidan sirg'alib chiqadi —
 * harflar bitta-bitta emas (aks holda chetdagi harf yolg'iz "lip" etib qolardi)
 */
const BEHIND_DURATION = 0.62;

const wordStart = (tl: Timeline, reveal: 'behind' | 'rise') => tl.word[0] + (reveal === 'rise' ? RISE_DELAY : 0);

/** Har harfning chiqish boshlanishi va davomiyligi */
const letterTiming = (tl: Timeline, reveal: 'behind' | 'rise', order: number): Span => {
  const w0 = wordStart(tl, reveal);
  return reveal === 'behind' ? [w0, w0 + BEHIND_DURATION] : [w0 + order * LETTER_STAGGER, w0 + order * LETTER_STAGGER + LETTER_DURATION];
};

/** Yozuv to'liq joyiga tushadigan payt (shu timeline uchun) */
export const settledAt = (tl: Timeline, reveal: 'behind' | 'rise' = 'behind'): number => {
  const letters = WORDMARK.primary.length + WORDMARK.accent.length;
  return Math.max(tl.lockup[1], letterTiming(tl, reveal, letters - 1)[1], tl.sheen[1]);
};

/* -------------------------------------------------------------- Yordamchi */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (t: number, [a, b]: Span) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const ease = {
  outCubic: (k: number) => 1 - (1 - k) ** 3,
  outQuart: (k: number) => 1 - (1 - k) ** 4,
  inOutCubic: (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  inOutSine: (k: number) => -(Math.cos(Math.PI * k) - 1) / 2,
  /** Ozgina oshib ketib qaytadi (kiy joyiga "o'tirishi") */
  outBack: (k: number, s = 1.15) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2,
};

/** Kiy birinchi marta o'z joyiga yetgan nuqta (outBack(k)=1 → k = 1 − s/(s+1)) */
const CUE_OVERSHOOT = 1.15;
const CUE_LAND_K = 1 - CUE_OVERSHOOT / (CUE_OVERSHOOT + 1);
/** Kiy shu masofadan (birlikda) ko'tariladi — boshida mato chetidan pastda yashirin */
const CUE_TRAVEL = 40;

/** Shar o'ngdan shuncha masofa dumalaydi; kiyga tezligining 25% i bilan uriladi */
const BALL_TRAVEL = 34;
const ARRIVAL_RATIO = 0.25;
const ROLL_TOTAL = (1 + ARRIVAL_RATIO) / 2;

const lampAt = (t: number, keys: Timeline['lamp']): number => {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return 1;
  if (t <= first[0]) return first[1];
  if (t >= last[0]) {
    // Joyiga tushgach chiroq juda sekin "nafas oladi" — kadr o'lik turmaydi
    const breath = clamp01((t - last[0] - 2.2) / 1.2);
    return last[1] + 0.018 * breath * Math.sin((t - last[0]) * 1.9);
  }
  for (let i = 1; i < keys.length; i += 1) {
    const a = keys[i - 1];
    const b = keys[i];
    if (a && b && t <= b[0]) return lerp(a[1], b[1], (t - a[0]) / (b[0] - a[0] || 1));
  }
  return last[1];
};

/* ----------------------------------------------------------------- Holat */

export interface BallState {
  x: number;
  y: number;
  /** Gorizontal tezlik, birlik/s (harakat izi uchun) */
  vx: number;
  visible: boolean;
}

export interface MarkState {
  lamp: number;
  appear: number;
  rim: number;
  cueY: number;
  cueVy: number;
  cueSheen: number;
  ballA: BallState;
  ballB: BallState;
  /** Shar tegishidan keyingi chaqnash: 0..1, chaqnash yo'q bo'lsa −1 */
  kiss: number;
  sheen: number;
}

const roll = (t: number, span: Span, finalX: number, finalY: number, dock: number): BallState => {
  const [t0, t1] = span;
  if (t < t0) return { x: finalX + BALL_TRAVEL, y: finalY, vx: 0, visible: false };
  if (t < t1) {
    const u = (t - t0) / (t1 - t0);
    // Bir tekis sekinlashuv: tezlik 1 → ARRIVAL_RATIO
    const distance = (u - ((1 - ARRIVAL_RATIO) * u * u) / 2) / ROLL_TOTAL;
    const speed = (1 - (1 - ARRIVAL_RATIO) * u) / ROLL_TOTAL;
    return {
      x: finalX + BALL_TRAVEL * (1 - distance),
      y: finalY,
      vx: (-BALL_TRAVEL * speed) / (t1 - t0),
      visible: true,
    };
  }
  // Kiyga urilib ozgina qaytadi va joyiga o'tiradi (so'nuvchi prujina)
  const tau = t - t1;
  return {
    x: finalX + dock * Math.exp(-tau / 0.06) * Math.sin((tau * 2 * Math.PI) / 0.15),
    y: finalY,
    vx: 0,
    visible: true,
  };
};

export const markStateAt = (t: number, tl: Timeline = TIMELINE): MarkState => {
  const cueK = seg(t, tl.cue);
  const cueE = ease.outBack(cueK, CUE_OVERSHOOT);
  // Tezlik — sonli hosila (harakat izi uchun yetarli aniq)
  const dt = 1 / 240;
  const cuePrev = ease.outBack(seg(t - dt, tl.cue), CUE_OVERSHOOT);

  const ballB = roll(t, tl.ballB, MARK.ballB.x, MARK.ballB.y, 0.5);
  const ballA = roll(t, tl.ballA, MARK.ballA.x, MARK.ballA.y, 0.45);

  const kissAt = tl.ballA[1];
  const sinceKiss = t - kissAt;
  if (sinceKiss >= 0) {
    // Ustki shar tekkanda pastkisi ozgina "cho'kib" qaytadi
    ballB.y += 0.55 * Math.exp(-sinceKiss / 0.05) * Math.sin((sinceKiss * 2 * Math.PI) / 0.12);
  }

  return {
    lamp: lampAt(t, tl.lamp),
    appear: seg(t, tl.tile),
    rim: ease.inOutCubic(seg(t, tl.rim)),
    cueY: (1 - cueE) * CUE_TRAVEL,
    cueVy: ((cuePrev - cueE) * CUE_TRAVEL) / dt,
    cueSheen: t >= tl.cueSheen[0] && t <= tl.cueSheen[1] ? seg(t, tl.cueSheen) : -1,
    ballA,
    ballB,
    kiss: sinceKiss >= 0 && sinceKiss <= 0.34 ? sinceKiss / 0.34 : -1,
    sheen: t >= tl.sheen[0] && t <= tl.sheen[1] ? seg(t, tl.sheen) : -1,
  };
};

/** Ovoz va sinov uchun: muhim lahzalar (soniya) */
export const introEvents = (tl: Timeline = TIMELINE) => ({
  lampTicks: tl.lamp.filter((key, i, all) => i > 0 && key[1] > (all[i - 1]?.[1] ?? 0)).map((key) => key[0]),
  rim: tl.rim,
  cueRise: [tl.cue[0], tl.cue[0] + CUE_LAND_K * (tl.cue[1] - tl.cue[0])] as Span,
  cueLand: tl.cue[0] + CUE_LAND_K * (tl.cue[1] - tl.cue[0]),
  ballBRoll: tl.ballB,
  ballBDock: tl.ballB[1],
  ballARoll: tl.ballA,
  kiss: tl.ballA[1],
  sheen: tl.sheen,
  word: tl.word,
  settled: settledAt(tl),
});

/* ----------------------------------------------------------------- Sahna */

export interface Box {
  /** Belgi (48 birlik) chap-yuqori burchagi va o'lchami, CSS px */
  x: number;
  y: number;
  size: number;
}

export interface WordBox {
  /** align=left: birinchi harfning chap cheti; align=center: o'rta nuqta */
  x: number;
  /** Birinchi qatorning tayanch chizig'i (alphabetic baseline) */
  baseline: number;
  /** Shrift o'lchami, CSS px */
  size: number;
  align: 'left' | 'center';
  /** 2 — "BILLIARD" va "CLUB" alohida qatorlarda (vertikal video) */
  lines: 1 | 2;
  lineHeight?: number;
}

export interface IntroScene {
  width: number;
  height: number;
  /** Canvas piksel zichligi (soya xiraligi qurilma pikselida beriladi) */
  pixelRatio: number;
  /** Yig'ilish paytidagi belgi */
  build: Box;
  /** Yakuniy kompozitsiya: belgi + yozuv */
  lockup: { mark: Box; word: WordBox };
  /** behind — yozuv belgi ortidan sirg'alib chiqadi; rise — harflar pastdan ko'tariladi */
  reveal: 'behind' | 'rise';
  fonts: { display: string; text: string };
  timeline?: Timeline;
  /** Sekin "kamera" yaqinlashuvi va shar tekkandagi titrash (video) */
  camera?: boolean;
  /** Yorug'likdagi chang zarralari */
  dust?: boolean;
  /** Qo'shimcha yorug'lik o'tishlari (video oxirida belgi "jonli" tursin) */
  sheens?: ReadonlyArray<Span>;
  /** Video oxiridagi manzil yozuvi */
  endCard?: { text: string; baseline: number; size: number; at: number } | null;
  /** Video oxirida fon rangiga so'nish (boshi ham qorong'i — aylanma ijro choksiz) */
  fadeOut?: Span | null;
  /**
   * Sarlavhadagi logotipga uchish: belgi va yozuv sahifadagi haqiqiy
   * logotip o'rniga tushadi, fon esa shu vaqt ichida so'nadi.
   */
  handoff?: { at: number; duration: number; mark: Box; word: WordBox | null } | null;
}

const lerpBox = (a: Box, b: Box, k: number): Box => ({
  x: lerp(a.x, b.x, k),
  y: lerp(a.y, b.y, k),
  size: lerp(a.size, b.size, k),
});

const handoffK = (scene: IntroScene, t: number): number =>
  scene.handoff ? ease.inOutCubic(seg(t, [scene.handoff.at, scene.handoff.at + scene.handoff.duration])) : 0;

export const markBoxAt = (scene: IntroScene, t: number): Box => {
  const tl = scene.timeline ?? TIMELINE;
  let box = lerpBox(scene.build, scene.lockup.mark, ease.inOutCubic(seg(t, tl.lockup)));
  if (scene.handoff) box = lerpBox(box, scene.handoff.mark, handoffK(scene, t));
  return box;
};

/* ------------------------------------------------------------- Chizish */

const roundRect = (c: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
};

const tilePath = (c: Ctx) => roundRect(c, MARK.tile.x, MARK.tile.y, MARK.tile.w, MARK.tile.h, MARK.tile.r);

/** Inkrustatsiya chizig'i nuqtalari: tepa o'rtadan soat yo'nalishida (o'ng yarmi) */
const RIM_HALF: ReadonlyArray<readonly [number, number]> = (() => {
  const { x, y, w, h, r } = MARK.rim;
  const pts: Array<readonly [number, number]> = [];
  const cx = x + w / 2;
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.5));
    for (let i = 0; i <= n; i += 1) pts.push([lerp(x0, x1, i / n), lerp(y0, y1, i / n)]);
  };
  const arc = (ax: number, ay: number, from: number, to: number) => {
    const n = 24;
    for (let i = 0; i <= n; i += 1) {
      const a = lerp(from, to, i / n);
      pts.push([ax + r * Math.cos(a), ay + r * Math.sin(a)]);
    }
  };
  line(cx, y, x + w - r, y);
  arc(x + w - r, y + r, -Math.PI / 2, 0);
  line(x + w, y + r, x + w, y + h - r);
  arc(x + w - r, y + h - r, 0, Math.PI / 2);
  line(x + w - r, y + h, cx, y + h);
  return pts;
})();

const RIM_HALF_LENGTH = RIM_HALF.reduce((sum, p, i) => {
  const prev = RIM_HALF[i - 1];
  return prev ? sum + Math.hypot(p[0] - prev[0], p[1] - prev[1]) : sum;
}, 0);

/** Yarim yo'lning `fraction` qismigacha bo'lgan nuqtalar va oxirgi (bosh) nuqta */
const rimUntil = (fraction: number) => {
  const target = RIM_HALF_LENGTH * fraction;
  const out: Array<readonly [number, number]> = [];
  let walked = 0;
  for (let i = 0; i < RIM_HALF.length; i += 1) {
    const p = RIM_HALF[i];
    const prev = RIM_HALF[i - 1];
    if (!p) continue;
    if (prev) {
      const step = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      if (walked + step >= target) {
        const k = step ? (target - walked) / step : 0;
        out.push([lerp(prev[0], p[0], k), lerp(prev[1], p[1], k)]);
        return out;
      }
      walked += step;
    }
    out.push(p);
  }
  return out;
};

const strokeRim = (c: Ctx, fraction: number, style: string | CanvasGradient, width: number) => {
  if (fraction <= 0) return;
  const pts = rimUntil(fraction);
  c.strokeStyle = style;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const mirror of [false, true]) {
    c.beginPath();
    pts.forEach(([px, py], i) => {
      const x = mirror ? 48 - px : px;
      if (i === 0) c.moveTo(x, py);
      else c.lineTo(x, py);
    });
    c.stroke();
  }
  return pts[pts.length - 1];
};

const glow = (c: Ctx, x: number, y: number, r: number, rgb: string, alpha: number) => {
  if (alpha <= 0.002 || r <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(0.4, `rgba(${rgb}, ${alpha * 0.35})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
};

const drawBall = (c: Ctx, x: number, y: number, r: number) => {
  const gx = x - 0.38 * r;
  const gy = y - 0.42 * r;
  const g = c.createRadialGradient(gx, gy, 0, gx, gy, 1.6 * r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.42, COLOR.ivory);
  g.addColorStop(1, COLOR.ivoryShade);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
};

const drawSpecular = (c: Ctx, x: number, y: number, r: number) => {
  const sx = x - 0.36 * r;
  const sy = y - 0.44 * r;
  const sr = 0.24 * r;
  const g = c.createRadialGradient(sx, sy, 0, sx, sy, sr);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(sx, sy, sr, 0, Math.PI * 2);
  c.fill();
};

const drawCue = (c: Ctx, offsetY: number, alpha: number) => {
  const { x, y, w, h, r, ferrule, band } = MARK.cue;
  c.save();
  c.globalAlpha = alpha;
  c.translate(0, offsetY);
  const g = c.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, COLOR.goldHover);
  g.addColorStop(0.3, COLOR.goldPale);
  g.addColorStop(0.65, COLOR.gold);
  g.addColorStop(1, COLOR.goldActive);
  roundRect(c, x, y, w, h, r);
  c.fillStyle = g;
  c.fill();
  c.clip();
  // Fil suyagi ferrul va oltin halqa — kiyning uchi
  c.fillStyle = COLOR.ivory;
  c.fillRect(x, y, w, ferrule);
  c.fillStyle = COLOR.goldActive;
  c.fillRect(x, y + ferrule, w, band);
  c.restore();
};

/** Belgi chizilayotgan oraliq qatlam (kiy+sharlar guruhiga bitta soya — SVG dagi kabi) */
const layers = new Map<number, { surface: Surface; ctx: Ctx }>();
const figureLayer = (size: number) => {
  const key = Math.max(8, Math.ceil(size));
  let layer = layers.get(key);
  if (!layer) {
    const surface: Surface =
      typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(key, key) : document.createElement('canvas');
    surface.width = key;
    surface.height = key;
    const ctx = surface.getContext('2d') as Ctx | null;
    if (!ctx) throw new Error('2D canvas mavjud emas');
    layer = { surface, ctx };
    // Bir nechta o'lcham kerak bo'ladi (uchish paytida belgi kichrayadi) — keshni cheklaymiz
    if (layers.size > 24) layers.clear();
    layers.set(key, layer);
  }
  return layer;
};

const drawMark = (c: Ctx, box: Box, st: MarkState, pixelRatio: number, ambient: number) => {
  const u = box.size / 48;
  if (u <= 0) return;
  const zoom = 0.9 + 0.1 * ease.outCubic(st.appear);
  const dev = u * zoom * pixelRatio;

  c.save();
  c.translate(box.x, box.y);
  c.scale(u, u);
  c.translate(24, 24);
  c.scale(zoom, zoom);
  c.translate(-24, -24);

  // 1) Mato — atrofidagi yumshoq soya bilan (sahifaga qo'nganda so'nadi)
  c.save();
  if (ambient > 0.01) {
    c.shadowColor = `rgba(0, 0, 0, ${0.55 * ambient * st.lamp})`;
    c.shadowBlur = 14 * dev;
    c.shadowOffsetY = 4 * dev;
  }
  const felt = c.createLinearGradient(MARK.tile.x, MARK.tile.y, MARK.tile.x + MARK.tile.w, MARK.tile.y + MARK.tile.h);
  felt.addColorStop(0, COLOR.feltLight);
  felt.addColorStop(1, COLOR.feltDeep);
  tilePath(c);
  c.fillStyle = felt;
  c.fill();
  c.restore();

  c.save();
  tilePath(c);
  c.clip();
  // Tepadagi chiroq aksi (BrandLogo: radialGradient cx .5 cy .1 r .6)
  const lamp = c.createRadialGradient(24, 5.6, 0, 24, 5.6, 27.6);
  lamp.addColorStop(0, `rgba(${COLOR.lampGreen}, 0.38)`);
  lamp.addColorStop(1, `rgba(${COLOR.lampGreen}, 0)`);
  c.fillStyle = lamp;
  c.fillRect(0, 0, 48, 48);

  // 2) Oltin inkrustatsiya — tepadan ikki tomonga chiziladi, uchlarida uchqun
  c.globalAlpha = 0.75;
  const head = strokeRim(c, st.rim, COLOR.gold, MARK.rim.width);
  c.globalAlpha = 1;
  if (head && st.rim < 1) {
    c.globalCompositeOperation = 'lighter';
    const a = 0.9 * (1 - st.rim ** 6);
    glow(c, head[0], head[1], 2.8, '255, 232, 180', a);
    glow(c, 48 - head[0], head[1], 2.8, '255, 232, 180', a);
    c.globalCompositeOperation = 'source-over';
  }

  // Chiroq yonmaguncha mato qorong'ida
  if (st.lamp < 1) {
    c.fillStyle = `rgba(3, 6, 5, ${(1 - Math.max(0, st.lamp)) * 0.94})`;
    c.fillRect(0, 0, 48, 48);
  }
  c.restore();

  // 3) Kiy va sharlar — alohida qatlamda, keyin bitta soya bilan (feDropShadow kabi)
  const layer = figureLayer(48 * dev);
  const lc = layer.ctx;
  const scale = layer.surface.width / 48;
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.clearRect(0, 0, layer.surface.width, layer.surface.height);
  lc.setTransform(scale, 0, 0, scale, 0, 0);
  lc.save();
  tilePath(lc);
  lc.clip();

  if (st.cueY < CUE_TRAVEL - 0.01) {
    // Harakat izi: tez ko'tarilayotgan kiy ortida xira nusxalar
    const blur = clamp01(Math.abs(st.cueVy) / 90);
    if (blur > 0.02) {
      [0.22, 0.13, 0.07].forEach((a, i) => drawCue(lc, st.cueY - (st.cueVy * (i + 1)) / 240, a * blur));
    }
    drawCue(lc, st.cueY, 1);
    if (st.cueSheen >= 0) {
      const { x, y, w, h, r } = MARK.cue;
      const cy = lerp(y + h + 6, y - 6, ease.inOutSine(st.cueSheen));
      const g = lc.createLinearGradient(0, cy - 6, 0, cy + 6);
      g.addColorStop(0, 'rgba(255, 250, 232, 0)');
      g.addColorStop(0.5, 'rgba(255, 250, 232, 0.55)');
      g.addColorStop(1, 'rgba(255, 250, 232, 0)');
      lc.save();
      roundRect(lc, x, y + st.cueY, w, h, r);
      lc.clip();
      lc.globalCompositeOperation = 'lighter';
      lc.fillStyle = g;
      lc.fillRect(x, cy - 6, w, 12);
      lc.restore();
    }
  }

  const balls: Array<[BallState, number]> = [
    [st.ballB, MARK.ballB.r],
    [st.ballA, MARK.ballA.r],
  ];
  for (const [ball, r] of balls) {
    if (!ball.visible) continue;
    const blur = clamp01(Math.abs(ball.vx) / 70);
    if (blur > 0.02) {
      [0.2, 0.11, 0.05].forEach((a, i) => {
        lc.globalAlpha = a * blur;
        drawBall(lc, ball.x - (ball.vx * (i + 1)) / 240, ball.y, r);
      });
      lc.globalAlpha = 1;
    }
    drawBall(lc, ball.x, ball.y, r);
  }
  lc.restore();

  c.save();
  tilePath(c);
  c.clip();
  c.shadowColor = 'rgba(3, 18, 11, 0.55)';
  c.shadowBlur = 1.8 * dev;
  c.shadowOffsetX = 0.8 * dev;
  c.shadowOffsetY = 1.3 * dev;
  c.drawImage(layer.surface as CanvasImageSource, 0, 0, 48, 48);
  c.shadowColor = 'transparent';

  // Shar yaltirashi (BrandLogo: soya guruhidan tashqarida)
  for (const [ball, r] of balls) if (ball.visible) drawSpecular(c, ball.x, ball.y, r);

  // 4) Sharlar tegishi — "chiq": kontakt nuqtasida qisqa chaqnash va halqa
  if (st.kiss >= 0) {
    const a = st.ballA;
    const b = st.ballB;
    const k = st.kiss;
    const ra = MARK.ballA.r;
    const rb = MARK.ballB.r;
    const px = a.x + ((b.x - a.x) * ra) / (ra + rb);
    const py = a.y + ((b.y - a.y) * ra) / (ra + rb);
    c.globalCompositeOperation = 'lighter';
    glow(c, px, py, lerp(1.2, 6.5, ease.outCubic(k)), '255, 246, 224', 0.8 * (1 - k) ** 2);
    c.strokeStyle = `rgba(255, 238, 205, ${0.24 * (1 - k) ** 1.5})`;
    c.lineWidth = 0.2 * (1 - k) + 0.04;
    c.beginPath();
    c.arc(px, py, lerp(1.5, 12, ease.outCubic(k)), 0, Math.PI * 2);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
  }

  // 5) Belgi ustidan diagonal yorug'lik o'tadi (oltin chiziq ham yarqiraydi)
  if (st.sheen >= 0) {
    const p = lerp(-0.2, 1.2, ease.inOutSine(st.sheen));
    const g = c.createLinearGradient(-8, -14, 56, 62);
    const stop = (offset: number, alpha: number) =>
      g.addColorStop(clamp01(offset), `rgba(255, 249, 236, ${alpha})`);
    stop(p - 0.14, 0);
    stop(p - 0.04, 0.16);
    stop(p, 0.34);
    stop(p + 0.04, 0.16);
    stop(p + 0.14, 0);
    c.globalCompositeOperation = 'screen';
    c.fillStyle = g;
    c.fillRect(0, 0, 48, 48);
    c.globalCompositeOperation = 'lighter';
    strokeRim(c, 1, g, MARK.rim.width * 1.6);
    c.globalCompositeOperation = 'source-over';
  }
  c.restore();
  c.restore();
};

/* --------------------------------------------------------------- Yozuv */

interface Glyph {
  ch: string;
  x: number;
  line: number;
  accent: boolean;
  order: number;
}

/** Harflar joyi — prefiks o'lchovi kerning'ni saqlaydi, ustiga harf oralig'i qo'shiladi */
const layoutGlyphs = (c: Ctx, word: WordBox, font: string, trackingEm: number): { glyphs: Glyph[]; widths: number[] } => {
  c.font = `700 ${word.size}px ${font}`;
  const lines =
    word.lines === 2
      ? [
          { text: WORDMARK.primary, accentFrom: Infinity },
          { text: WORDMARK.accent, accentFrom: 0 },
        ]
      : [{ text: `${WORDMARK.primary} ${WORDMARK.accent}`, accentFrom: WORDMARK.primary.length + 1 }];
  const spacing = trackingEm * word.size;
  const glyphs: Glyph[] = [];
  const widths: number[] = [];
  let order = 0;
  lines.forEach((line, li) => {
    const width = c.measureText(line.text).width + spacing * (line.text.length - 1);
    widths.push(width);
    const start = word.align === 'center' ? word.x - width / 2 : word.x;
    for (let i = 0; i < line.text.length; i += 1) {
      const ch = line.text[i] ?? '';
      if (ch === ' ') continue;
      glyphs.push({
        ch,
        x: start + c.measureText(line.text.slice(0, i)).width + spacing * i,
        line: li,
        accent: i >= line.accentFrom,
        order: order++,
      });
    }
  });
  return { glyphs, widths };
};

/** Yozuvning o'lchami (joylashuvni hisoblash uchun) */
export const measureWordmark = (c: Ctx, size: number, font: string, lines: 1 | 2 = 1, trackingEm: number = WORDMARK.tracking) => {
  const { widths } = layoutGlyphs(c, { x: 0, baseline: 0, size, align: 'left', lines }, font, trackingEm);
  c.font = `700 ${size}px ${font}`;
  const m = c.measureText('B');
  return {
    width: Math.max(...widths),
    /** Bosh harf balandligi (cap height) */
    cap: m.actualBoundingBoxAscent,
    /** CSS line-height:1 dagi tayanch chiziq siljishi: markaz + (A − D)/2 */
    baselineShift: ((m.fontBoundingBoxAscent ?? size * 0.9) - (m.fontBoundingBoxDescent ?? size * 0.25)) / 2,
  };
};

const drawWordmark = (c: Ctx, scene: IntroScene, t: number, word: WordBox, markRight: number, alpha: number) => {
  const tl = scene.timeline ?? TIMELINE;
  const w0 = wordStart(tl, scene.reveal);
  if (t < w0 || alpha <= 0) return;
  const tracking = lerp(0.22, WORDMARK.tracking, ease.outQuart(seg(t, [w0, w0 + 0.85])));
  const { glyphs } = layoutGlyphs(c, word, scene.fonts.display, tracking);
  const lineHeight = word.lineHeight ?? word.size * 1.12;
  const revealing = t < letterTiming(tl, scene.reveal, glyphs.length - 1)[1];

  // CLUB bo'ylab oltin yaltirash
  const shimmerK = seg(t, [w0 + 0.55, w0 + 1.2]);
  const accent = glyphs.filter((g) => g.accent);
  let accentStyle: string | CanvasGradient = COLOR.gold;
  const firstAccent = accent[0];
  const lastAccent = accent[accent.length - 1];
  if (shimmerK > 0 && shimmerK < 1 && firstAccent && lastAccent) {
    const x0 = firstAccent.x;
    const x1 = lastAccent.x + word.size;
    const g = c.createLinearGradient(x0, 0, x1, 0);
    const p = lerp(-0.35, 1.35, ease.inOutSine(shimmerK));
    g.addColorStop(0, COLOR.gold);
    g.addColorStop(clamp01(p - 0.22), COLOR.gold);
    g.addColorStop(clamp01(p), '#fff3cf');
    g.addColorStop(clamp01(p + 0.22), COLOR.gold);
    g.addColorStop(1, COLOR.gold);
    accentStyle = g;
  }

  c.save();
  c.font = `700 ${word.size}px ${scene.fonts.display}`;
  c.textBaseline = 'alphabetic';
  if (revealing && scene.reveal === 'behind') {
    // Yozuv belgining ortidan chiqadi: belgining o'ng chetidan chapda ko'rinmaydi
    c.beginPath();
    c.rect(markRight, -scene.height, scene.width * 2, scene.height * 3);
    c.clip();
  }
  for (const g of glyphs) {
    const k = ease.outCubic(seg(t, letterTiming(tl, scene.reveal, g.order)));
    if (k <= 0) continue;
    const baseline = word.baseline + g.line * lineHeight;
    let dx = 0;
    let dy = 0;
    if (scene.reveal === 'behind') dx = -(1 - k) * 0.55 * word.size;
    else dy = (1 - k) * 0.62 * word.size;
    c.save();
    if (revealing && scene.reveal === 'rise') {
      c.beginPath();
      c.rect(-scene.width, baseline - word.size * 1.4, scene.width * 3, word.size * 1.4 + word.size * 0.22);
      c.clip();
    }
    c.globalAlpha = alpha * k;
    c.fillStyle = g.accent ? accentStyle : COLOR.text;
    c.fillText(g.ch, g.x + dx, baseline + dy);
    c.restore();
  }
  c.restore();
};

/* --------------------------------------------------------------- Muhit */

interface Mote {
  x: number;
  y: number;
  s: number;
  p1: number;
  p2: number;
  p3: number;
  front: boolean;
}

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};

const MOTES: ReadonlyArray<Mote> = (() => {
  const rnd = mulberry32(20261030);
  return Array.from({ length: 56 }, (_, i) => ({
    x: rnd(),
    y: rnd(),
    s: rnd(),
    p1: rnd() * Math.PI * 2,
    p2: rnd() * Math.PI * 2,
    p3: rnd() * Math.PI * 2,
    front: i % 7 === 0,
  }));
})();

const drawDust = (c: Ctx, scene: IntroScene, focus: Box, t: number, lamp: number, alpha: number, front: boolean) => {
  const unit = Math.min(scene.width, scene.height) / 1080;
  const cx = focus.x + focus.size / 2;
  const cy = focus.y + focus.size * 0.1;
  const rx = Math.max(scene.width * 0.36, focus.size * 1.6);
  const ry = Math.max(scene.height * 0.5, focus.size * 1.8);
  for (const m of MOTES) {
    if (m.front !== front) continue;
    const ny = (((m.y - t * (0.01 + m.s * 0.016)) % 1) + 1) % 1;
    const nx = m.x + 0.02 * Math.sin(t * (0.3 + m.s * 0.35) + m.p1);
    const px = cx + (nx - 0.5) * 2 * rx;
    const py = cy + (ny - 0.5) * 2 * ry + 6 * unit * Math.sin(t * 0.7 + m.p2);
    const d = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
    const mask = clamp01(1 - d) ** 1.5;
    const twinkle = 0.55 + 0.45 * Math.sin(t * (0.8 + m.s) + m.p3);
    const a = (front ? 0.07 : 0.32) * mask * twinkle * lamp * alpha;
    if (a < 0.004) continue;
    const r = (front ? 9 + m.s * 12 : 0.7 + m.s * 1.6) * unit;
    if (front) glow(c, px, py, r, '255, 238, 205', a);
    else {
      c.fillStyle = `rgba(255, 238, 205, ${a})`;
      c.beginPath();
      c.arc(px, py, r, 0, Math.PI * 2);
      c.fill();
    }
  }
};

/**
 * Chiroq nuri: tepada tor, pastga kengayadi, chetlari va oxiri juda yumshoq.
 * Qatlamlar bilan chizilganda chetlarida chiziqlar qolardi — shuning uchun
 * nur pikselma-piksel (kichik o'lchamda, keyin silliq kattalashtirib) bir marta
 * hisoblanadi va keshlanadi.
 */
const beams = new Map<string, { surface: Surface; x: number; y: number; w: number; h: number }>();
const beamSprite = (W: number, fx: number, top: number, bottom: number, topWidth: number, bottomWidth: number) => {
  const key = [W, fx, top, bottom, topWidth, bottomWidth].map((v) => Math.round(v)).join(':');
  const cached = beams.get(key);
  if (cached) return cached;
  const step = 4;
  const x0 = fx - bottomWidth;
  const w = bottomWidth * 2;
  const h = bottom - top;
  const sw = Math.max(2, Math.ceil(w / step));
  const sh = Math.max(2, Math.ceil(h / step));
  const surface: Surface = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(sw, sh) : document.createElement('canvas');
  surface.width = sw;
  surface.height = sh;
  const bc = surface.getContext('2d') as Ctx | null;
  if (!bc) return null;
  const img = bc.createImageData(sw, sh);
  const smooth = (a: number, b: number, v: number) => {
    const k = clamp01((v - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  for (let j = 0; j < sh; j += 1) {
    const v = j / (sh - 1);
    const half = lerp(topWidth, bottomWidth, v) / 2;
    const fade = (1 - v) ** 1.25 * (0.35 + 0.65 * smooth(0, 0.12, v));
    for (let i = 0; i < sw; i += 1) {
      const dx = Math.abs(x0 + (i / (sw - 1)) * w - fx) / half;
      const a = (1 - smooth(0.35, 1.15, dx)) * fade;
      const o = (j * sw + i) * 4;
      img.data[o] = 255;
      img.data[o + 1] = 236;
      img.data[o + 2] = 198;
      img.data[o + 3] = Math.round(a * 0.11 * 255);
    }
  }
  bc.putImageData(img, 0, 0);
  const sprite = { surface, x: x0, y: top, w, h };
  if (beams.size > 8) beams.clear();
  beams.set(key, sprite);
  return sprite;
};

const drawStage = (c: Ctx, scene: IntroScene, focus: Box, lamp: number, alpha: number) => {
  const { width: W, height: H } = scene;
  if (alpha <= 0) return;
  c.fillStyle = `rgba(${COLOR.bg}, ${alpha})`;
  c.fillRect(-W, -H, W * 3, H * 3);
  const L = Math.max(0, lamp) * alpha;
  if (L <= 0.002) return;
  const fx = focus.x + focus.size / 2;
  const fy = focus.y + focus.size / 2;

  // Tepadan tushayotgan iliq yorug'lik doirasi (stol ustidagi chiroq)
  c.save();
  c.translate(fx, fy - focus.size * 0.7);
  c.scale(1, 1.3);
  const R = Math.max(W, H) * 0.6;
  const pool = c.createRadialGradient(0, 0, 0, 0, 0, R);
  pool.addColorStop(0, `rgba(255, 234, 192, ${0.1 * L})`);
  pool.addColorStop(0.4, `rgba(255, 228, 178, ${0.045 * L})`);
  pool.addColorStop(1, 'rgba(255, 228, 178, 0)');
  c.fillStyle = pool;
  c.fillRect(-R, -R, R * 2, R * 2);
  c.restore();

  // Nur konusi: tepadan belgigacha — bir marta hisoblanadigan silliq tasvir
  const beam = beamSprite(W, fx, -H * 0.04, fy + focus.size * 0.75, Math.max(W * 0.06, focus.size * 0.55), focus.size * 1.5);
  if (beam) {
    c.save();
    c.globalAlpha = Math.min(1, L);
    c.drawImage(beam.surface as CanvasImageSource, beam.x, beam.y, beam.w, beam.h);
    c.restore();
  }

  // Mato aksi — belgining orqasida yashil nur
  const bounce = c.createRadialGradient(fx, fy, 0, fx, fy, focus.size * 1.55);
  bounce.addColorStop(0, `rgba(${COLOR.lampGreen}, ${0.17 * L})`);
  bounce.addColorStop(1, `rgba(${COLOR.lampGreen}, 0)`);
  c.fillStyle = bounce;
  c.fillRect(fx - focus.size * 1.6, fy - focus.size * 1.6, focus.size * 3.2, focus.size * 3.2);
};

const drawVignette = (c: Ctx, scene: IntroScene, alpha: number) => {
  const { width: W, height: H } = scene;
  if (alpha <= 0) return;
  const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, `rgba(0, 0, 0, ${0.6 * alpha})`);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
};

const drawEndCard = (c: Ctx, scene: IntroScene, t: number) => {
  const card = scene.endCard;
  if (!card || t < card.at - 0.1) return;
  const k = ease.outCubic(seg(t, [card.at, card.at + 0.7]));
  const rule = ease.outCubic(seg(t, [card.at - 0.1, card.at + 0.6]));
  const cx = scene.width / 2;
  const unit = Math.min(scene.width, scene.height) / 1080;
  c.save();
  c.strokeStyle = `rgba(219, 179, 92, ${0.6 * rule})`;
  c.lineWidth = 1.6 * unit;
  c.lineCap = 'round';
  const half = 34 * unit * rule;
  const ry = card.baseline - card.size * 2;
  c.beginPath();
  c.moveTo(cx - half, ry);
  c.lineTo(cx + half, ry);
  c.stroke();

  c.font = `500 ${card.size}px ${scene.fonts.text}`;
  c.textBaseline = 'alphabetic';
  c.fillStyle = COLOR.textMuted;
  c.globalAlpha = k;
  const spacing = 0.26 * card.size;
  const width = c.measureText(card.text).width + spacing * (card.text.length - 1);
  const x0 = cx - width / 2;
  for (let i = 0; i < card.text.length; i += 1) {
    c.fillText(card.text[i] ?? '', x0 + c.measureText(card.text.slice(0, i)).width + spacing * i, card.baseline + (1 - k) * 10 * unit);
  }
  c.restore();
};

/**
 * Bitta kadr. `c` ning o'zgartirishi (transform) CSS px ga sozlangan bo'lishi
 * kerak (canvas.width = width × pixelRatio, setTransform(pixelRatio, …)).
 */
export const drawIntroFrame = (c: Ctx, scene: IntroScene, t: number): void => {
  const tl = scene.timeline ?? TIMELINE;
  const st = markStateAt(t, tl);
  if (st.sheen < 0 && scene.sheens) {
    const extra = scene.sheens.find((span) => t >= span[0] && t <= span[1]);
    if (extra) st.sheen = seg(t, extra);
  }
  const hk = handoffK(scene, t);
  const stage = 1 - hk;
  const box = markBoxAt(scene, t);
  const { width: W, height: H } = scene;

  c.save();
  c.clearRect(0, 0, W, H);

  if (scene.camera) {
    // Juda sekin yaqinlashuv + shar tekkanda bir lahzalik titrash
    const k = ease.outCubic(seg(t, [0, 3.2]));
    const s = lerp(1.07, 1, k);
    const since = t - tl.ballA[1];
    const shake = since >= 0 ? 2.4 * (H / 1080) * Math.exp(-since / 0.045) * Math.sin(since * 2 * Math.PI * 22) : 0;
    c.translate(W / 2, H / 2 + lerp(12 * (H / 1080), 0, k) + shake);
    c.scale(s, s);
    c.translate(-W / 2, -H / 2);
  }

  drawStage(c, scene, scene.build, st.lamp, stage);
  drawVignette(c, scene, stage);
  if (scene.dust) drawDust(c, scene, scene.build, t, st.lamp, stage, false);

  drawMark(c, box, st, scene.pixelRatio, stage);

  // Yozuv: yakuniy joyidan sarlavhadagi yozuv o'rniga (yoki so'nib yo'qoladi)
  let word = scene.lockup.word;
  let wordAlpha = 1;
  if (scene.handoff) {
    const target = scene.handoff.word;
    if (target) {
      // Ikkalasini chap chetga keltirib oralaymiz (vertikal kompozitsiyada yozuv markazda)
      const src = scene.lockup.word;
      const srcLeft = src.align === 'center' ? src.x - measureWordmark(c, src.size, scene.fonts.display).width / 2 : src.x;
      word = {
        ...src,
        align: 'left',
        lines: 1,
        x: lerp(srcLeft, target.x, hk),
        baseline: lerp(src.baseline, target.baseline, hk),
        size: lerp(src.size, target.size, hk),
      };
    } else {
      wordAlpha = clamp01(1 - hk * 1.8);
    }
  }
  drawWordmark(c, scene, t, word, box.x + box.size * 1.02, wordAlpha);

  if (scene.dust) drawDust(c, scene, scene.build, t, st.lamp, stage, true);
  drawEndCard(c, scene, t);

  if (scene.fadeOut) {
    const k = ease.inOutSine(seg(t, scene.fadeOut));
    if (k > 0) {
      c.fillStyle = `rgba(${COLOR.bg}, ${k})`;
      c.fillRect(-W, -H, W * 3, H * 3);
    }
  }
  c.restore();
};

/* -------------------------------------------------------- Joylashuvlar */

export interface LayoutFonts {
  display: string;
  text: string;
}

/**
 * Sayt/dastur intro'si uchun sahna: keng ekranda gorizontal (BrandLogo
 * nisbatlari: oraliq 0.28·o'lcham, yozuv 0.38·o'lcham), tor ekranda belgi
 * tepada, yozuv pastda.
 */
export const layoutIntro = (
  c: Ctx,
  width: number,
  height: number,
  pixelRatio: number,
  fonts: LayoutFonts,
  options: { buildSize?: number } = {},
): IntroScene => {
  const wide = width >= 720 && width / height >= 1.05;
  const buildSize = options.buildSize ?? Math.round(Math.max(112, Math.min(wide ? 230 : 190, Math.min(width, height) * (wide ? 0.26 : 0.4))));
  const build: Box = { x: (width - buildSize) / 2, y: (height - buildSize) / 2, size: buildSize };

  if (wide) {
    // BrandLogo kabi: belgi | oraliq | yozuv — kenglikning ~78% idan oshmaydi
    let s = buildSize * 0.66;
    const fit = () => {
      const m = measureWordmark(c, s * 0.38, fonts.display);
      return { m, total: s + s * 0.28 + m.width };
    };
    let { m, total } = fit();
    if (total > width * 0.78) {
      s *= (width * 0.78) / total;
      ({ m, total } = fit());
    }
    const left = (width - total) / 2;
    const cy = height / 2;
    return {
      width,
      height,
      pixelRatio,
      build,
      lockup: {
        mark: { x: left, y: cy - s / 2, size: s },
        word: { x: left + s * 1.28, baseline: cy + m.baselineShift, size: s * 0.38, align: 'left', lines: 1 },
      },
      reveal: 'behind',
      fonts,
      dust: true,
    };
  }

  const s = buildSize * 0.8;
  let size = Math.min(s * 0.3, 40);
  const maxWidth = width * 0.84;
  const measured = measureWordmark(c, size, fonts.display);
  if (measured.width > maxWidth) size *= maxWidth / measured.width;
  const m = measureWordmark(c, size, fonts.display);
  const gap = s * 0.2;
  const total = s + gap + m.cap;
  const top = (height - total) / 2 - height * 0.02;
  return {
    width,
    height,
    pixelRatio,
    build,
    lockup: {
      mark: { x: (width - s) / 2, y: top, size: s },
      word: { x: width / 2, baseline: top + s + gap + m.cap, size, align: 'center', lines: 1 },
    },
    reveal: 'rise',
    fonts,
    dust: true,
  };
};
