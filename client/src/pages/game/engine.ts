/**
 * BilliardEngine — HAQIQIY fizikali stol dvigateli (canvas 2D).
 *
 * `components/ui/BilliardTable.tsx` dagi sinovdan o'tgan fizikaga asoslanadi
 * (substepli integratsiya, elastik to'qnashuv, bort/jag' sakrashi, teshikka
 * tushish), lekin 2 kishilik HOTSEAT o'yin uchun qayta ishlangan:
 *   • pool-AI yo'q — ikkala o'yinchi ham inson;
 *   • zarba natijasi (potted / scratch / firstContact) yozib boriladi —
 *     qoidalar dvigateli (rules.ts) shu asosda navbat/ochko/fauln hisoblaydi;
 *   • "ingliz" (spin): follow/draw + yon spin — kiy soqqasi egri yo'l oladi;
 *   • sharlarning AYLANISHI: har shar sirt orientatsiyasi (3D vektor) bilan
 *     dumalab boradi — raqam va chiziq (stripe) sirt bo'ylab suriladi.
 *
 * Rang faqat theme/tokens.ts dan (mato/oltin/kumush) va rules.ts (shar ranglari).
 */
import { TOKENS } from '../../theme/tokens';
import type { BallSpec, ShotResult } from './rules';

const { emerald } = TOKENS.color;

const IVORY = '#f2ede1';

export interface Pocket {
  x: number;
  y: number;
  corner: boolean;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Ball {
  id: number; // 0 = kiy soqqasi (biток), 1.. = obyekt sharlar
  number: number; // ko'rsatiladigan raqam (0 — kiy)
  kind: BallSpec['kind'];
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean; // stolda (tushmagan)
  sink: number; // 1 = to'liq; teshikka tushayotganda 0 ga kamayadi
  sinkTo: Pocket | null;
  /** Raqam qutbi orientatsiyasi (birlik vektor) — dumalaganda suriladi */
  ori: Vec3;
  /** Chiziq (stripe) qutbi — ori ga ortogonal, band ellipsini beradi */
  pole: Vec3;
}

/** Rodrigues: `v` vektorni `k` (birlik o'q) atrofida `a` burchakka aylantirish */
const rotate = (v: Vec3, k: Vec3, a: number): Vec3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dot = k.x * v.x + k.y * v.y + k.z * v.z;
  // k × v
  const cx = k.y * v.z - k.z * v.y;
  const cy = k.z * v.x - k.x * v.z;
  const cz = k.x * v.y - k.y * v.x;
  return {
    x: v.x * c + cx * s + k.x * dot * (1 - c),
    y: v.y * c + cy * s + k.y * dot * (1 - c),
    z: v.z * c + cz * s + k.z * dot * (1 - c),
  };
};

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export class BilliardEngine {
  w = 0;
  h = 0;
  r = 12;
  private cushion = 20;
  private cm = 22; // burchak teshigi og'zi (bort bo'ylab)
  private mm = 18; // o'rta teshik og'zi (yarim kenglik)
  private throat = 20; // markaz shunga yetsa — tushadi
  private jaw = 4; // jag' (pocket point) radiusi
  balls: Ball[] = [];
  pockets: Pocket[] = [];
  private jaws: { x: number; y: number }[] = [];

  /** Zarba jarayonida — natija yozib boriladi */
  private shooting = false;
  private firstContact: number | null = null;
  private potted: number[] = [];
  private cueScratched = false;
  private resultReady = false;
  /** Kiy soqqasi spini (ingliz): side = yon, fwd = follow(+)/draw(−) */
  private spinSide = 0;
  private spinFwd = 0;
  private followApplied = false;

  get cue(): Ball | undefined {
    return this.balls.find((b) => b.id === 0);
  }

  /** Kiy soqqasi tinch va zarbaga tayyormi */
  canAim(): boolean {
    const cue = this.cue;
    return !this.shooting && !!cue && cue.active && cue.sink >= 1 && Math.hypot(cue.vx, cue.vy) < 0.06;
  }

  allResting(): boolean {
    return this.balls.every((b) => !b.active || Math.hypot(b.vx, b.vy) < 0.05);
  }

  get isShooting(): boolean {
    return this.shooting;
  }

  /** Zarba tugab, natija tayyor bo'lsa — bir marta qaytaradi (keyin tozalaydi) */
  takeResult(): ShotResult | null {
    if (!this.resultReady) return null;
    this.resultReady = false;
    const objectsPotted = this.potted.filter((n) => n !== 0);
    return {
      potted: objectsPotted,
      cueScratched: this.cueScratched,
      firstContact: this.firstContact,
      eightPotted: objectsPotted.includes(8),
    };
  }

  /** Ekran o'lchami + stol geometriyasini hisoblash (BilliardTable bilan bir xil nisbatlar) */
  setSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const r = Math.max(8, Math.min(w, h) * 0.03);
    this.r = r;
    this.cushion = Math.min(w, h) * 0.05;
    this.cm = r * 2.3;
    this.mm = r * 2.0;
    this.throat = r * 2.05;
    this.jaw = r * 0.22;

    const c = this.cushion;
    this.pockets = [
      { x: c * 0.5, y: c * 0.5, corner: true },
      { x: w - c * 0.5, y: c * 0.5, corner: true },
      { x: c * 0.5, y: h - c * 0.5, corner: true },
      { x: w - c * 0.5, y: h - c * 0.5, corner: true },
      { x: w / 2, y: c * 0.4, corner: false },
      { x: w / 2, y: h - c * 0.4, corner: false },
    ];
    const cm = this.cm;
    const mm = this.mm;
    this.jaws = [
      { x: c + cm, y: c },
      { x: w / 2 - mm, y: c },
      { x: w / 2 + mm, y: c },
      { x: w - c - cm, y: c },
      { x: c + cm, y: h - c },
      { x: w / 2 - mm, y: h - c },
      { x: w / 2 + mm, y: h - c },
      { x: w - c - cm, y: h - c },
      { x: c, y: c + cm },
      { x: c, y: h - c - cm },
      { x: w - c, y: c + cm },
      { x: w - c, y: h - c - cm },
    ];

    // Sharlar bo'lsa — chegara ichida ushlab qolamiz
    const rr = this.r;
    this.balls.forEach((b) => {
      b.x = Math.min(Math.max(b.x, c + rr + 1), w - c - rr - 1);
      b.y = Math.min(Math.max(b.y, c + rr + 1), h - c - rr - 1);
    });
  }

  /** Piramidani (yoki pul rakkasini) berilgan spec tartibida terish */
  rack(specs: BallSpec[]): void {
    const { w, h, r } = this;
    const cy = h / 2;
    const apexX = w * 0.62;
    const gapX = r * 1.74;
    const gapY = r * 2.04;

    const balls: Ball[] = [];
    // Kiy soqqasi (biток) — "uy" chizig'ida
    const cueSpec = specs.find((s) => s.kind === 'cue');
    balls.push(this.makeBall(0, cueSpec?.number ?? 0, 'cue', cueSpec?.color ?? IVORY, w * 0.24, cy));

    const objects = specs.filter((s) => s.kind !== 'cue');
    let idx = 0;
    for (let col = 0; col < 5; col++) {
      const count = col + 1;
      const x = apexX + col * gapX;
      for (let i = 0; i < count; i++) {
        const spec = objects[idx];
        if (!spec) break;
        const y = cy + (i - (count - 1) / 2) * gapY;
        // Zich terishda ozgina siljish — dastlab bir-biriga kirib turmasin
        balls.push(this.makeBall(idx + 1, spec.number, spec.kind, spec.color, x, y));
        idx++;
      }
    }
    this.balls = balls;
    this.resetShotRecord();
    this.resultReady = false;
  }

  private makeBall(
    id: number,
    number: number,
    kind: BallSpec['kind'],
    color: string,
    x: number,
    y: number,
  ): Ball {
    // Boshlang'ich orientatsiya har sharda biroz farq qilsin (raqamlar bir xil qaramasin)
    const seed = (id * 2.399963) % (Math.PI * 2);
    const ori = rotate({ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, seed);
    const pole = rotate({ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, seed);
    return {
      id,
      number,
      kind,
      color,
      x,
      y,
      vx: 0,
      vy: 0,
      active: true,
      sink: 1,
      sinkTo: null,
      ori,
      pole,
    };
  }

  private resetShotRecord(): void {
    this.firstContact = null;
    this.potted = [];
    this.cueScratched = false;
    this.followApplied = false;
    this.spinSide = 0;
    this.spinFwd = 0;
  }

  /** Kiy soqqasini joylashtirish mumkinmi (boshqa shar bilan ustma-ust emas, stol ichida) */
  validCuePlacement(x: number, y: number): boolean {
    const c = this.cushion;
    const r = this.r;
    if (x < c + r || x > this.w - c - r || y < c + r || y > this.h - c - r) return false;
    for (const b of this.balls) {
      if (b.id === 0 || !b.active) continue;
      if (dist(x, y, b.x, b.y) < r * 2.05) return false;
    }
    return true;
  }

  /** Kiy soqqasini "qo'lda" joylashtirish (scratch / ball-in-hand) */
  placeCue(x: number, y: number): void {
    const cue = this.cue;
    if (!cue) return;
    cue.x = x;
    cue.y = y;
    cue.vx = 0;
    cue.vy = 0;
    cue.active = true;
    cue.sink = 1;
    cue.sinkTo = null;
  }

  /**
   * Zarba boshlash. `power` — piksel/kadr tezligi; `english` — {x,y} ∈ [−1,1]
   * (x = yon spin, y = follow(+)/draw(−)).
   */
  beginShot(dirX: number, dirY: number, power: number, english: { x: number; y: number }): void {
    const cue = this.cue;
    if (!cue || !this.canAim()) return;
    const len = Math.hypot(dirX, dirY) || 1;
    cue.vx = (dirX / len) * power;
    cue.vy = (dirY / len) * power;
    this.resetShotRecord();
    this.spinSide = english.x * 0.9;
    this.spinFwd = english.y;
    this.shooting = true;
  }

  /** Bitta kadr — substeplar bilan (tez shar tunnel qilmaydi) */
  step(dt: number): void {
    let maxV = 0;
    for (const b of this.balls) {
      if (b.active && b.sink >= 1) maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
    }
    const sub = Math.min(12, Math.max(1, Math.ceil((maxV * dt) / (this.r * 0.3))));
    const sdt = dt / sub;
    for (let s = 0; s < sub; s++) this.integrate(sdt);

    if (this.shooting && this.allResting()) {
      this.shooting = false;
      this.resultReady = true;
    }
  }

  private integrate(dt: number): void {
    const { r, w, h, cushion, cm, mm } = this;
    const friction = Math.pow(0.985, dt);
    const rest = 0.82;

    for (const b of this.balls) {
      if (!b.active) continue;

      if (b.sink < 1) {
        if (b.sinkTo) {
          const k = Math.min(1, dt * 0.4);
          b.x += (b.sinkTo.x - b.x) * k;
          b.y += (b.sinkTo.y - b.y) * k;
        }
        b.sink -= dt * 0.09;
        if (b.sink <= 0) b.active = false;
        continue;
      }

      const speed = Math.hypot(b.vx, b.vy);

      // Yon spin — kiy soqqasi yo'lini ozgina egadi (masse-lite)
      if (b.id === 0 && this.spinSide !== 0 && speed > 0.05) {
        const ux = b.vx / speed;
        const uy = b.vy / speed;
        const px = -uy;
        const py = ux;
        const k = this.spinSide * speed * 0.02;
        b.vx += px * k;
        b.vy += py * k;
        this.spinSide *= Math.pow(0.94, dt);
      }

      // Dumalash — orientatsiya vektorlarini aylantirish
      if (speed > 0.02) {
        const ux = b.vx / speed;
        const uy = b.vy / speed;
        const ang = (speed * dt) / r;
        const axis: Vec3 = { x: -uy, y: ux, z: 0 };
        b.ori = rotate(b.ori, axis, ang);
        b.pole = rotate(b.pole, axis, ang);
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= friction;
      b.vy *= friction;
      if (Math.hypot(b.vx, b.vy) < 0.03) {
        b.vx = 0;
        b.vy = 0;
      }

      // 1) Teshikka tushish (magnitsiz — markaz throat ga yetsa)
      let dropped = false;
      for (const p of this.pockets) {
        if (dist(b.x, b.y, p.x, p.y) < this.throat) {
          b.sinkTo = p;
          b.sink = 0.999;
          b.vx *= 0.35;
          b.vy *= 0.35;
          if (!this.potted.includes(b.number) || b.id === 0) {
            if (b.id === 0) this.cueScratched = true;
            this.potted.push(b.number);
          }
          dropped = true;
          break;
        }
      }
      if (dropped) continue;

      // 2) Jag' (pocket point) — rattle
      for (const j of this.jaws) {
        const d = dist(b.x, b.y, j.x, j.y);
        const min = r + this.jaw;
        if (d < min) {
          const nx = (b.x - j.x) / (d || 1);
          const ny = (b.y - j.y) / (d || 1);
          b.x = j.x + nx * min;
          b.y = j.y + ny * min;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= 2 * vn * nx * 0.85;
            b.vy -= 2 * vn * ny * 0.85;
          }
        }
      }

      // 3) Bort (cushion) — faqat segment ichida (teshik og'zi bo'shligidan tashqarida)
      const inTopBot =
        (b.x > cushion + cm && b.x < w / 2 - mm) || (b.x > w / 2 + mm && b.x < w - cushion - cm);
      if (b.y < cushion + r && inTopBot) {
        b.y = cushion + r;
        b.vy = Math.abs(b.vy) * rest;
      } else if (b.y > h - cushion - r && inTopBot) {
        b.y = h - cushion - r;
        b.vy = -Math.abs(b.vy) * rest;
      }
      const inSides = b.y > cushion + cm && b.y < h - cushion - cm;
      if (b.x < cushion + r && inSides) {
        b.x = cushion + r;
        b.vx = Math.abs(b.vx) * rest;
      } else if (b.x > w - cushion - r && inSides) {
        b.x = w - cushion - r;
        b.vx = -Math.abs(b.vx) * rest;
      }

      // 4) Zaxira — kanvasdan chiqib ketsa, eng yaqin teshikka tushiriladi.
      //    MUHIM: bu ham teshikka tushish — step 1 kabi natijaga yozilishi shart,
      //    aks holda shar "g'oyib" bo'lib qoladi (rules bilan desinxron: 8-ball
      //    yutib bo'lmaydigan bo'ladi yoki biток yo'qolib o'yin qotib qoladi).
      if (b.x < -r || b.x > w + r || b.y < -r || b.y > h + r) {
        let np = this.pockets[0];
        let nd = Infinity;
        for (const p of this.pockets) {
          const d = dist(b.x, b.y, p.x, p.y);
          if (d < nd) {
            nd = d;
            np = p;
          }
        }
        b.sinkTo = np;
        b.sink = 0.999;
        b.vx *= 0.35;
        b.vy *= 0.35;
        if (!this.potted.includes(b.number) || b.id === 0) {
          if (b.id === 0) this.cueScratched = true;
          this.potted.push(b.number);
        }
      }
    }

    // Soqqa-soqqa to'qnashuvi (impuls; faqat yaqinlashayotganda) — BilliardTable bilan bir xil
    const REST = 0.95;
    const CFRICTION = 0.02;
    const min = r * 2;
    const live = this.balls.filter((b) => b.active && b.sink >= 1);
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i];
          const c = live[j];
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          if (d >= min) continue;
          const nx = dx / d;
          const ny = dy / d;
          const overlap = (min - d) / 2;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          c.x += nx * overlap;
          c.y += ny * overlap;
          const rvx = a.vx - c.vx;
          const rvy = a.vy - c.vy;
          const vn = rvx * nx + rvy * ny;
          if (vn <= 0) continue;

          // Birinchi kontakt (kiy soqqasi ↔ obyekt shar) — qoidalar uchun
          if (this.firstContact === null && (a.id === 0 || c.id === 0)) {
            const obj = a.id === 0 ? c : a;
            this.firstContact = obj.number;
          }

          const jn = ((1 + REST) * vn) / 2;
          a.vx -= jn * nx;
          a.vy -= jn * ny;
          c.vx += jn * nx;
          c.vy += jn * ny;
          const tx = -ny;
          const ty = nx;
          const vt = rvx * tx + rvy * ty;
          const jt = vt * CFRICTION;
          a.vx -= jt * tx;
          a.vy -= jt * ty;
          c.vx += jt * tx;
          c.vy += jt * ty;

          // Follow / draw — kiy soqqasining birinchi to'qnashuvida
          if (!this.followApplied && (a.id === 0 || c.id === 0) && this.spinFwd !== 0) {
            const cueBall = a.id === 0 ? a : c;
            cueBall.vx += nx * this.spinFwd * 1.4;
            cueBall.vy += ny * this.spinFwd * 1.4;
            this.followApplied = true;
          }
        }
      }
    }
  }

  /* ------------------------------------------------------------- Chizish */

  draw(ctx: CanvasRenderingContext2D): void {
    const { w, h, cushion: c, cm, mm } = this;
    ctx.clearRect(0, 0, w, h);

    // Mato
    const felt = ctx.createRadialGradient(w * 0.5, h * 0.42, h * 0.12, w * 0.5, h * 0.5, w * 0.75);
    felt.addColorStop(0, '#2a7d4f');
    felt.addColorStop(0.6, emerald.felt);
    felt.addColorStop(1, '#0e2c1c');
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, w, h);

    // Ko'tarilgan rezina bortlar (teshik og'izlarida uzilgan)
    this.drawCushion(ctx, c + cm, 0, w / 2 - mm - (c + cm), c, 'h');
    this.drawCushion(ctx, w / 2 + mm, 0, w - c - cm - (w / 2 + mm), c, 'h');
    this.drawCushion(ctx, c + cm, h - c, w / 2 - mm - (c + cm), c, 'h');
    this.drawCushion(ctx, w / 2 + mm, h - c, w - c - cm - (w / 2 + mm), c, 'h');
    this.drawCushion(ctx, 0, c + cm, c, h - 2 * (c + cm), 'v');
    this.drawCushion(ctx, w - c, c + cm, c, h - 2 * (c + cm), 'v');

    // Bort tumshug'i yorug'lik chizig'i
    ctx.strokeStyle = 'rgba(120,200,150,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c + cm, c);
    ctx.lineTo(w / 2 - mm, c);
    ctx.moveTo(w / 2 + mm, c);
    ctx.lineTo(w - c - cm, c);
    ctx.moveTo(c + cm, h - c);
    ctx.lineTo(w / 2 - mm, h - c);
    ctx.moveTo(w / 2 + mm, h - c);
    ctx.lineTo(w - c - cm, h - c);
    ctx.moveTo(c, c + cm);
    ctx.lineTo(c, h - c - cm);
    ctx.moveTo(w - c, c + cm);
    ctx.lineTo(w - c, h - c - cm);
    ctx.stroke();

    // "Uy" chizig'i va bosh nuqta
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.28, c);
    ctx.lineTo(w * 0.28, h - c);
    ctx.stroke();

    // Charm teshiklar
    for (const p of this.pockets) {
      const R = this.throat * 1.15;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R * 1.15, 0, Math.PI * 2);
      ctx.fillStyle = '#241a12';
      ctx.fill();
      const pg = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, R);
      pg.addColorStop(0, '#000');
      pg.addColorStop(0.7, '#050605');
      pg.addColorStop(1, '#181410');
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.fillStyle = pg;
      ctx.fill();
    }

    // Bort nishonlari (diamonds)
    ctx.fillStyle = 'rgba(240,236,225,0.5)';
    const diamond = (x: number, y: number) => {
      const s = Math.max(1.6, this.r * 0.16);
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s, y);
      ctx.closePath();
      ctx.fill();
    };
    diamond(w * 0.25, c * 0.5);
    diamond(w * 0.75, c * 0.5);
    diamond(w * 0.25, h - c * 0.5);
    diamond(w * 0.75, h - c * 0.5);
    diamond(c * 0.5, h * 0.5);
    diamond(w - c * 0.5, h * 0.5);

    // Sharlar — tinchlari avval, harakatdagilari ustidan
    for (const b of this.balls) if (b.active) this.drawBall(ctx, b);
  }

  private drawCushion(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cw: number,
    ch: number,
    side: 'h' | 'v',
  ): void {
    const grad =
      side === 'h'
        ? ctx.createLinearGradient(0, y, 0, y + ch)
        : ctx.createLinearGradient(x, 0, x + cw, 0);
    grad.addColorStop(0, '#1c5636');
    grad.addColorStop(0.5, '#17492d');
    grad.addColorStop(1, '#0f3420');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, cw, ch);
  }

  private drawBall(ctx: CanvasRenderingContext2D, b: Ball): void {
    const rr = this.r * b.sink;
    if (rr <= 0.5) return;

    // Soya
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + rr * 0.55, rr * 0.92, rr * 0.46, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fill();

    const isStripe = b.kind === 'stripe';
    const base = b.kind === 'cue' ? b.color : isStripe ? '#f6f2e8' : b.color;
    const dark =
      b.kind === 'cue'
        ? shade(b.color, -0.4)
        : isStripe
          ? '#c9c2ad'
          : shade(b.color, -0.45);

    // Asos (radial gradient — hajm)
    const g = ctx.createRadialGradient(
      b.x - rr * 0.34,
      b.y - rr * 0.4,
      rr * 0.12,
      b.x,
      b.y,
      rr,
    );
    g.addColorStop(0, shade(base, 0.35));
    g.addColorStop(0.5, base);
    g.addColorStop(1, dark);
    ctx.beginPath();
    ctx.arc(b.x, b.y, rr, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // Chiziqli (stripe) — qutb (pole) bo'yicha ellips band
    if (isStripe) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, rr, 0, Math.PI * 2);
      ctx.clip();
      const p = b.pole;
      const pxy = Math.hypot(p.x, p.y);
      const ang = Math.atan2(p.y, p.x);
      // Ekvatorial band: katta o'q pxy ga tik (rr), kichik o'q pxy bo'ylab (rr*|pz|)
      const major = rr;
      const minor = rr * Math.abs(p.z);
      const grad = ctx.createLinearGradient(b.x, b.y - rr, b.x, b.y + rr);
      grad.addColorStop(0, shade(b.color, 0.28));
      grad.addColorStop(0.5, b.color);
      grad.addColorStop(1, shade(b.color, -0.3));
      ctx.fillStyle = grad;
      ctx.beginPath();
      // Bandni ikki ellips yoyi orasidagi soha sifatida — soddaroq: qalin ellips shtrix
      ctx.ellipse(b.x, b.y, Math.max(minor, 0.6), major, ang, 0, Math.PI * 2);
      ctx.fill();
      // pxy≈0 (qutb kameraga qaragan) — band butun halqa; ozgina qorong'i kontur
      if (pxy < 0.08) {
        ctx.strokeStyle = shade(b.color, -0.2);
        ctx.lineWidth = rr * 0.14;
        ctx.beginPath();
        ctx.arc(b.x, b.y, rr * 0.72, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Raqam — sirt orientatsiyasi (ori) old yarim sharda bo'lsa
    if (b.number > 0 && b.ori.z > -0.15 && b.sink > 0.7) {
      const proj = 0.6;
      const nx = b.x + b.ori.x * rr * proj;
      const ny = b.y + b.ori.y * rr * proj;
      // Chetga yaqinlashganda kichrayadi/so'nadi (dumalash hissi)
      const fade = Math.max(0, Math.min(1, (b.ori.z + 0.15) / 0.5));
      const cr = rr * 0.42 * (0.7 + 0.3 * fade);
      ctx.globalAlpha = 0.35 + 0.65 * fade;
      // Oq raqam doirasi (pul sharlarida standart)
      if (b.kind !== 'cue') {
        ctx.beginPath();
        ctx.arc(nx, ny, cr, 0, Math.PI * 2);
        ctx.fillStyle = '#f7f4ec';
        ctx.fill();
      }
      ctx.fillStyle = b.kind === 'cue' ? '#8a1e14' : 'rgba(30,26,18,0.92)';
      ctx.font = `700 ${cr * 1.05}px 'Inter Variable', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(b.number), nx, ny + cr * 0.06);
      ctx.globalAlpha = 1;
    } else if (b.kind === 'cue' && b.sink > 0.7) {
      // Kiy soqqasida qizil nuqta — spin/aylanish ko'rinsin
      if (b.ori.z > -0.1) {
        const nx = b.x + b.ori.x * rr * 0.6;
        const ny = b.y + b.ori.y * rr * 0.6;
        ctx.beginPath();
        ctx.arc(nx, ny, rr * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = '#cf3a2e';
        ctx.fill();
      }
    }

    // Yaltirash
    ctx.beginPath();
    ctx.arc(b.x - rr * 0.33, b.y - rr * 0.37, rr * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();
  }

  /** Mo'ljal chizig'i + kiy — component chaqiradi (draw dan keyin) */
  drawAim(
    ctx: CanvasRenderingContext2D,
    targetX: number,
    targetY: number,
    power: number,
    charging: boolean,
  ): void {
    const cue = this.cue;
    if (!cue || !this.canAim()) return;
    const dx = targetX - cue.x;
    const dy = targetY - cue.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    // Mo'ljal chizig'i + ghost soqqa (birinchi to'siqgача)
    let ghostDist = Math.min(len, Math.max(this.w, this.h));
    for (const b of this.balls) {
      if (b.id === 0 || !b.active || b.sink < 1) continue;
      const bx = b.x - cue.x;
      const by = b.y - cue.y;
      const t = bx * ux + by * uy;
      if (t <= 0) continue;
      const perp = Math.abs(bx * -uy + by * ux);
      if (perp < this.r * 2) {
        const back = Math.sqrt(Math.max(0, (this.r * 2) ** 2 - perp * perp));
        ghostDist = Math.min(ghostDist, t - back);
      }
    }
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cue.x + ux * this.r, cue.y + uy * this.r);
    ctx.lineTo(cue.x + ux * ghostDist, cue.y + uy * ghostDist);
    ctx.stroke();
    ctx.setLineDash([]);
    // Ghost soqqa
    ctx.beginPath();
    ctx.arc(cue.x + ux * ghostDist, cue.y + uy * ghostDist, this.r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Kiy tayoq — quvvatga qarab orqaga tortiladi
    const pull = charging ? 10 + power * 40 : 10;
    const cueStart = pull + this.r + 6;
    const cueLen = Math.min(this.w, this.h) * 0.6;
    const grad = ctx.createLinearGradient(
      cue.x - ux * cueStart,
      cue.y - uy * cueStart,
      cue.x - ux * (cueStart + cueLen),
      cue.y - uy * (cueStart + cueLen),
    );
    grad.addColorStop(0, '#e8c069');
    grad.addColorStop(0.12, '#caa24a');
    grad.addColorStop(1, '#5a4a24');
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(4, this.r * 0.42);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cue.x - ux * cueStart, cue.y - uy * cueStart);
    ctx.lineTo(cue.x - ux * (cueStart + cueLen), cue.y - uy * (cueStart + cueLen));
    ctx.stroke();
    ctx.restore();
  }
}

/** Rangni yoritish (+) / to'qlashtirish (−) — gradient uchun */
function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  if (amt >= 0) {
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
  } else {
    const k = 1 + amt;
    r = Math.round(r * k);
    g = Math.round(g * k);
    b = Math.round(b * k);
  }
  return `rgb(${r},${g},${b})`;
}
