/**
 * BilliardEngine — HAQIQIY fizikali stol dvigateli (canvas 2D).
 *
 * FIZIKA MODELI (rigid sfera + mato, top-down 2D):
 *   • Har shar CHIZIQLI tezlik (vx,vy) VA BURCHAK tezlik ω=(wx,wy,wz) bilan yuradi.
 *     wz — vertikal o'q atrofidagi YON spin (english); wx,wy — dumalash spini.
 *   • Kontakt nuqta (shar tagi) sirpanish tezligi:
 *        slip = (vx − R·wy,  vy + R·wx)
 *     Sirpanishда kinetik ishqalanish slip ni NOLGA olib keladi (sfera uchun
 *     to'xtatuvchi impuls = 2/7·|slip|) va shu bilan v ↔ ω ni bog'laydi. Bu —
 *     follow/draw/stun ning HAQIQIY sababi:
 *        - obyekt sharga urilганда normal impuls markazlar chizig'i bo'ylab
 *          o'tadi → SPIN o'zgarmaydi, faqat chiziqli tezlik uzatiladi;
 *        - kiy soqqasi spinni SAQLAB qoladi → mato ishqalanishi qolgan spinni
 *          yana chiziqli harakatga aylantiradi: oldinga (follow) yoki orqaga (draw).
 *   • Yon english: zarbada squirt (ozgina og'ish), obyekt sharга throw, va
 *     bortdan qaytishда burchak o'zgarishi beradi.
 *
 * Variantlar (rules.ts GameType):
 *   • american — Amerika pul (8-ball): keng lyuzalar (og'iz ≈ 1.9·diametr).
 *   • russian  — Rus piramidasi: JUDA TOR lyuzalar (og'iz ≈ 1.12·diametr) —
 *     haqiqiy rus bilyardidagidek, deyarli shar kattaligidagi teshiklar.
 *
 * Rang faqat theme/tokens.ts (mato/oltin) va rules.ts (shar ranglari) dan.
 */
import { TOKENS } from '../../theme/tokens';
import type { BallSpec, GameType, ShotResult } from './rules';

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
  /** Burchak tezligi (rad/kadr): wx,wy — dumalash; wz — yon spin (english) */
  wx: number;
  wy: number;
  wz: number;
  active: boolean; // stolda (tushmagan)
  sink: number; // 1 = to'liq; teshikka tushayotganda 0 ga kamayadi
  sinkTo: Pocket | null;
  /** Raqam qutbi orientatsiyasi (birlik vektor) — dumalaganda suriladi */
  ori: Vec3;
  /** Chiziq (stripe) qutbi — ori ga ortogonal, band ellipsini beradi */
  pole: Vec3;
}

/** Variantga xos geometriya (o'lchamlar r ga nisbatan multiplikator) */
interface VariantGeo {
  /** Shar radiusi = ballRatio · min(w,h) */
  ballRatio: number;
  /** Burchak lyuza og'zining yarim kengligi (r birlikda) */
  cornerMouth: number;
  /** O'rta lyuza og'zining yarim kengligi (r birlikda) */
  middleMouth: number;
  /** Teshikka tushish (capture) masofasi markazdan (r birlikda) */
  capture: number;
  /** Jag' (pocket point) radiusi (r birlikda) */
  jaw: number;
  /** Bort restitutsiyasi (qaytish elastikligi) */
  rail: number;
}

/**
 * HAQIQIY o'lchamlar asosida (WPA pul + rus piramida federatsiya spetsi;
 * manba: drdavepoolinfo.com / WPA / russianpyramid):
 *  • Amerika pul: shar 57.15mm, stol 2540×1270mm (2:1). Burchak lyuza og'zi
 *    ≈115mm = 2.0·diametr (keng), o'rta ≈129mm = 2.26·diametr.
 *  • Rus piramida: shar 68mm, stol ~3500×1750mm (2:1). Burchak lyuza og'zi
 *    ≈72mm = 1.06·DIAMETR — deyarli shar kattaligida (har tomondan ~2mm!),
 *    o'rta ≈83mm = 1.22·diametr. Bu — rus bilyardini keskin qiyin qiladigan
 *    asosiy farq. (og'iz to'liq kengligi = 2·cornerMouth·r, shar diametri = 2r,
 *    shuning uchun cornerMouth = og'iz/diametr.)
 * Shar/stol nisbati: pul (0.0225) > rus (0.0194) — dimensional to'g'ri; ekranda
 * ko'rinishi uchun ikkalasi ham bir oz kattalashtirilgan, nisbat saqlangan.
 *
 * DIQQAT (burchak geometriyasi): burchak lyuzada shar IKKI jag' orasidagi
 * DIAGONAL teshikdan o'tadi — jag'lar (c+cm,c) va (c,c+cm) da, ular orasidagi
 * masofa = cm·√2. Shuning uchun haqiqiy og'iz kengligiga moslash uchun
 *   cornerMouth = (og'iz/diametr) · √2.
 *   • pul: 2.0·√2 ≈ 2.83 (keng, kechirimli);
 *   • rus: ~1.13·√2 ≈ 1.60 (haqiqiy 1.06, ammo sichqoncha bilan o'ynash uchun
 *     ozgina yumshoq — shundoq ham amerikadan ancha tor).
 * O'rta lyuza to'g'ri (diagonal emas): mouth = 2·mm, mm/r = og'iz/diametr.
 */
const VARIANTS: Record<GameType, VariantGeo> = {
  american: { ballRatio: 0.027, cornerMouth: 2.83, middleMouth: 2.26, capture: 1.75, jaw: 0.2, rail: 0.82 },
  russian: { ballRatio: 0.025, cornerMouth: 1.74, middleMouth: 1.4, capture: 1.42, jaw: 0.12, rail: 0.86 },
};

/* ------------------------------------------------------- Fizika konstantalari
 * Birliklar: piksel, kadr (1 kadr ≈ 16.67ms). Qiymatlar r (shar radiusi) ga
 * kalibrlangan, shuning uchun stol o'lchamidan mustaqil.
 */
/** Dumalash qarshiligi (px/kadr², r birlikda) — sekin, uzoq yuradi */
const MU_ROLL = 0.010;
/** Sirpanish ishqalanishi impuls tezligi (px/kadr, r birlikda) — slip ni tez o'ldiradi */
const MU_SLIDE = 0.09;
/** Yon spin (wz) so'nishi (kadr boshiga) */
const SPIN_DECAY = 0.972;
/** Shar-shar restitutsiyasi (deyarli elastik) */
const E_BB = 0.95;
/** Shar-shar ishqalanishi (throw kuchi) */
const BB_FRICTION = 0.06;
/** Yon english → zarbada squirt og'ishi (rad, english.x=1 uchun ≈ 2.6°;
 *  haqiqiy diapazon ~1–3°, standart shaft ~2.5°) */
const SQUIRT = 0.045;
/** Zarbada kiy uchi maksimal ofseti (R birlikda) — 0.4R tabiiy dumalash beradi */
const TIP_MAX = 0.5;
/** Yon spin → bortdan qaytishда tangensial tezlik (burchak o'zgarishi) */
const RAIL_SPIN = 0.55;
/** Yon spin → yo'lning ozgina egrilishi (masse-lite). Tekis kiyda bu effekt
 *  KICHIK bo'ladi (asosiy english effektlari — throw va bort qaytishi). */
const SWERVE = 0.0016;
/** Tinchlik chegaralari */
const V_EPS = 0.02;
const SLIP_EPS = 0.03;

/** Rodrigues: `v` vektorni `k` (birlik o'q) atrofida `a` burchakka aylantirish */
const rotate = (v: Vec3, k: Vec3, a: number): Vec3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dot = k.x * v.x + k.y * v.y + k.z * v.z;
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
  private geo: VariantGeo = VARIANTS.russian;
  private cushion = 20;
  private cm = 22; // burchak teshigi og'zi (bort bo'ylab, yarim kenglik)
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

  get cue(): Ball | undefined {
    return this.balls.find((b) => b.id === 0);
  }

  /** O'yin variantini o'rnatish (geometriya + fizika farqlari) */
  setVariant(variant: GameType): void {
    this.geo = VARIANTS[variant];
    if (this.w && this.h) this.setSize(this.w, this.h);
  }

  /** Sharning kontakt-nuqta (tag) sirpanish tezligi */
  private slipSpeed(b: Ball): number {
    return Math.hypot(b.vx - this.r * b.wy, b.vy + this.r * b.wx);
  }

  /** Kiy soqqasi tinch va zarbaga tayyormi */
  canAim(): boolean {
    const cue = this.cue;
    return (
      !this.shooting &&
      !!cue &&
      cue.active &&
      cue.sink >= 1 &&
      Math.hypot(cue.vx, cue.vy) < 0.06 &&
      this.slipSpeed(cue) < 0.06
    );
  }

  /** Barcha sharlar tinchlanганmi (chiziqli VA spin bo'yicha) */
  allResting(): boolean {
    return this.balls.every(
      (b) => !b.active || (Math.hypot(b.vx, b.vy) < V_EPS && this.slipSpeed(b) < SLIP_EPS),
    );
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

  /** Ekran o'lchami + stol geometriyasini variantga qarab hisoblash */
  setSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const g = this.geo;
    const r = Math.max(7, Math.min(w, h) * g.ballRatio);
    this.r = r;
    this.cushion = Math.min(w, h) * 0.05;
    this.cm = r * g.cornerMouth;
    this.mm = r * g.middleMouth;
    this.throat = r * g.capture;
    this.jaw = r * g.jaw;

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
    // Boshlang'ich orientatsiya har sharda biroz farq qilsin
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
      wx: 0,
      wy: 0,
      wz: 0,
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
    cue.wx = 0;
    cue.wy = 0;
    cue.wz = 0;
    cue.active = true;
    cue.sink = 1;
    cue.sinkTo = null;
  }

  /**
   * Zarba boshlash. `power` — piksel/kadr tezligi; `english` — {x,y} ∈ [−1,1]
   * (x = yon spin, y = follow(+)/draw(−)).
   *
   * Kiy uchi ofseti ω ga aylantiriladi:
   *  • vertikal (y): (ẑ×dir) o'qi atrofida dumalash spini. 0.4R ofset (y≈0.8)
   *    tabiiy dumalash beradi; undan yuqori — follow, past — draw.
   *  • yon (x): vertikal o'q atrofida wz (english) + squirt (ozgina og'ish).
   */
  beginShot(dirX: number, dirY: number, power: number, english: { x: number; y: number }): void {
    const cue = this.cue;
    if (!cue || !this.canAim()) return;
    const R = this.r;
    const len = Math.hypot(dirX, dirY) || 1;
    let ux = dirX / len;
    let uy = dirY / len;

    // Squirt: yon english kiy soqqasini mo'ljal chizig'idan ozgina chetга chiqaradi
    // (english ga QARAMA-QARSHI). Kichik burchak.
    const sq = -english.x * SQUIRT;
    const cs = Math.cos(sq);
    const sn = Math.sin(sq);
    const dx2 = ux * cs - uy * sn;
    const dy2 = ux * sn + uy * cs;
    ux = dx2;
    uy = dy2;

    cue.vx = ux * power;
    cue.vy = uy * power;

    // Vertikal english → dumalash spini, (ẑ × dir) o'qi bo'yicha.
    // Tabiiy dumalash: ω = v/R (tip 0.4R). ω = 5·b·v/(2R²), b = english.y·TIP_MAX·R.
    const bV = english.y * TIP_MAX * R;
    const wPerp = (5 * bV * power) / (2 * R * R);
    // ẑ × dir = (−uy, ux, 0)
    cue.wx = wPerp * -uy;
    cue.wy = wPerp * ux;

    // Yon english → vertikal o'q spini wz (throw va bort qaytishi uchun)
    const bH = english.x * TIP_MAX * R;
    cue.wz = (5 * bH * power) / (2 * R * R);

    this.resetShotRecord();
    this.shooting = true;
  }

  /** Bitta kadr — substeplar bilan (tez shar tunnel qilmaydi) */
  step(dt: number): void {
    let maxV = 0;
    for (const b of this.balls) {
      if (b.active && b.sink >= 1) {
        maxV = Math.max(maxV, Math.hypot(b.vx, b.vy), this.slipSpeed(b));
      }
    }
    const sub = Math.min(14, Math.max(1, Math.ceil((maxV * dt) / (this.r * 0.28))));
    const sdt = dt / sub;
    for (let s = 0; s < sub; s++) this.integrate(sdt);

    if (this.shooting && this.allResting()) {
      // Qoldiq mayda tezliklarni tozalaymiz (keyingi mo'ljal toza bo'lsin)
      for (const b of this.balls) {
        b.vx = 0;
        b.vy = 0;
        b.wx = 0;
        b.wy = 0;
        b.wz = 0;
      }
      this.shooting = false;
      this.resultReady = true;
    }
  }

  private integrate(dt: number): void {
    const { r, w, h, cushion, cm, mm } = this;
    const R = r;

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

      // ---- 1) Dumalash qarshiligi: chiziqli tezlikni ozgina kamaytiradi
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 1e-5) {
        const ns = Math.max(0, sp - MU_ROLL * R * dt);
        b.vx *= ns / sp;
        b.vy *= ns / sp;
      }

      // ---- 2) Kontakt (tag) sirpanish ishqalanishi: slip → 0, v↔ω ni bog'laydi.
      //         Sfera uchun to'xtatuvchi impuls = (2/7)·slip; kinetik friksiya
      //         har kadrda impulsni MU_SLIDE·R·dt gача cheklaydi.
      const sx = b.vx - R * b.wy;
      const sy = b.vy + R * b.wx;
      const slip = Math.hypot(sx, sy);
      if (slip > 1e-5) {
        const ux = sx / slip;
        const uy = sy / slip;
        let dJ = MU_SLIDE * R * dt;
        const dJstop = (2 / 7) * slip;
        if (dJ > dJstop) dJ = dJstop;
        // Chiziqli: Δv = −dJ·u
        b.vx -= ux * dJ;
        b.vy -= uy * dJ;
        // Burchak: Δω = (5·dJ)/(2R)·(−uy, ux, 0)  (tag kontakt impulsining momenti)
        const k = (5 * dJ) / (2 * R);
        b.wx += k * -uy;
        b.wy += k * ux;
      }

      // ---- 3) Yon spin (wz): so'nish + yo'lning ozgina egrilishi (swerve)
      if (b.wz !== 0) {
        if (sp > 0.05) {
          // wz ishorasiga qarab tezlikка perpendikulyar kichik itarish
          const uxv = b.vx / sp;
          const uyv = b.vy / sp;
          const k = b.wz * SWERVE * R * dt;
          b.vx += -uyv * k;
          b.vy += uxv * k;
        }
        b.wz *= Math.pow(SPIN_DECAY, dt);
        if (Math.abs(b.wz) < 1e-4) b.wz = 0;
      }

      // ---- 4) Harakat
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // ---- 5) Orientatsiya (dumalash + spin) — ω o'qi atrofida aylanish
      const wMag = Math.hypot(b.wx, b.wy, b.wz);
      if (wMag > 1e-5) {
        const axis: Vec3 = { x: b.wx / wMag, y: b.wy / wMag, z: b.wz / wMag };
        b.ori = rotate(b.ori, axis, wMag * dt);
        b.pole = rotate(b.pole, axis, wMag * dt);
      }

      // To'liq tinchlik — mayda qoldiqlarni nolga
      if (Math.hypot(b.vx, b.vy) < V_EPS && this.slipSpeed(b) < SLIP_EPS && Math.abs(b.wz) < 0.02) {
        b.vx = 0;
        b.vy = 0;
        b.wx = 0;
        b.wy = 0;
        b.wz = 0;
      }

      // ---- 6) Teshikka tushish (markaz throat ga yetsa)
      let dropped = false;
      for (const p of this.pockets) {
        if (dist(b.x, b.y, p.x, p.y) < this.throat) {
          this.sink(b, p);
          dropped = true;
          break;
        }
      }
      if (dropped) continue;

      // ---- 7) Jag' (pocket point) — rattle
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

      // ---- 8) Bort (cushion) — spin bilan
      const inTopBot =
        (b.x > cushion + cm && b.x < w / 2 - mm) || (b.x > w / 2 + mm && b.x < w - cushion - cm);
      if (b.y < cushion + r && inTopBot) {
        b.y = cushion + r;
        this.railBounce(b, 0, 1);
      } else if (b.y > h - cushion - r && inTopBot) {
        b.y = h - cushion - r;
        this.railBounce(b, 0, -1);
      }
      const inSides = b.y > cushion + cm && b.y < h - cushion - cm;
      if (b.x < cushion + r && inSides) {
        b.x = cushion + r;
        this.railBounce(b, 1, 0);
      } else if (b.x > w - cushion - r && inSides) {
        b.x = w - cushion - r;
        this.railBounce(b, -1, 0);
      }

      // ---- 9) Zaxira — kanvasdan chiqib ketsa, eng yaqin teshikka tushiriladi
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
        this.sink(b, np);
      }
    }

    this.collideBalls();
  }

  /** Sharni teshikka tushirish (natijaga yozish bilan) */
  private sink(b: Ball, p: Pocket): void {
    b.sinkTo = p;
    b.sink = 0.999;
    b.vx *= 0.35;
    b.vy *= 0.35;
    if (!this.potted.includes(b.number) || b.id === 0) {
      if (b.id === 0) this.cueScratched = true;
      this.potted.push(b.number);
    }
  }

  /**
   * Bort qaytishi (n = ichkariga qaragan normal, birlik). Normal tezlik
   * restitutsiya bilan qaytadi; YON spin (wz) tangensial tezlik qo'shadi
   * (qaytish burchagi o'zgaradi — "bort spini"), bort esa wz ni qisman yeydi.
   */
  private railBounce(b: Ball, nx: number, ny: number): void {
    const rest = this.geo.rail;
    // Tangensial birlik (n ni 90° aylantirish)
    const tx = -ny;
    const ty = nx;
    let vn = b.vx * nx + b.vy * ny; // ichkariga qarab manfiy
    let vt = b.vx * tx + b.vy * ty;
    if (vn < 0) vn = -vn * rest; // qaytadi
    // Yon spin tangensial tezlik qo'shadi (english bilan bort qaytishi)
    vt += this.r * b.wz * RAIL_SPIN;
    // Bort tangensial ishqalanishi (ozgina so'nadi) + spin qisman yeyiladi
    vt *= 0.9;
    b.wz *= 0.6;
    b.vx = nx * vn + tx * vt;
    b.vy = ny * vn + ty * vt;
    // Dumalash spini yangi tezlikка moslashsin (bort sharni "aylantiradi")
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0.05) {
      b.wx = -b.vy / this.r;
      b.wy = b.vx / this.r;
    }
  }

  /** Soqqa-soqqa to'qnashuvi — normal impuls (spin saqlanadi) + throw */
  private collideBalls(): void {
    const r = this.r;
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
          if (vn <= 0) continue; // ajralib ketyapti

          // Birinchi kontakt (kiy soqqasi ↔ obyekt shar) — qoidalar uchun
          if (this.firstContact === null && (a.id === 0 || c.id === 0)) {
            const obj = a.id === 0 ? c : a;
            this.firstContact = obj.number;
          }

          // Normal impuls (teng massa, deyarli elastik). Markazlar chizig'i
          // bo'ylab → SPIN o'zgarmaydi: follow/draw shu tufayli SAQLANADI.
          const jn = ((1 + E_BB) * vn) / 2;
          a.vx -= jn * nx;
          a.vy -= jn * ny;
          c.vx += jn * nx;
          c.vy += jn * ny;

          // Throw: kontakt nuqtadagi tangensial sirt tezligi (spin bilan).
          // a ning kontakti +n·R da, c niki −n·R da.
          const tx = -ny;
          const ty = nx;
          // Sirt tezligi = v + ω × (R·nhat). Vertikal o'q (wz) hissasi:
          //   (wz ẑ) × (R n) = wz·R·(ẑ×n) = wz·R·(−n.y, n.x) = wz·R·t
          const surfA = (a.vx * tx + a.vy * ty) + this.r * a.wz;
          const surfC = (c.vx * tx + c.vy * ty) - this.r * c.wz;
          const vtRel = surfA - surfC;
          // Coulomb: throw impulsi normal impulsга cheklanган
          let jt = vtRel * 0.5;
          const maxJt = BB_FRICTION * jn;
          if (jt > maxJt) jt = maxJt;
          if (jt < -maxJt) jt = -maxJt;
          a.vx -= jt * tx;
          a.vy -= jt * ty;
          c.vx += jt * tx;
          c.vy += jt * ty;
          // Yon spin qisman uzatiladi/so'nadi
          a.wz *= 0.85;
          c.wz = c.wz * 0.85 - (jt / this.r) * 0.5;
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

    // Charm teshiklar (o'lcham variantга bog'liq — throat dan)
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

    // Sharlar
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
      b.kind === 'cue' ? shade(b.color, -0.4) : isStripe ? '#c9c2ad' : shade(b.color, -0.45);

    // Asos (radial gradient — hajm)
    const g = ctx.createRadialGradient(b.x - rr * 0.34, b.y - rr * 0.4, rr * 0.12, b.x, b.y, rr);
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
      const major = rr;
      const minor = rr * Math.abs(p.z);
      const grad = ctx.createLinearGradient(b.x, b.y - rr, b.x, b.y + rr);
      grad.addColorStop(0, shade(b.color, 0.28));
      grad.addColorStop(0.5, b.color);
      grad.addColorStop(1, shade(b.color, -0.3));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, Math.max(minor, 0.6), major, ang, 0, Math.PI * 2);
      ctx.fill();
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
      const fade = Math.max(0, Math.min(1, (b.ori.z + 0.15) / 0.5));
      const cr = rr * 0.42 * (0.7 + 0.3 * fade);
      ctx.globalAlpha = 0.35 + 0.65 * fade;
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
