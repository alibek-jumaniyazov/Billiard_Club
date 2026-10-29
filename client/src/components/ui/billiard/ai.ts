/**
 * Namoyish o'yinchisi (auto-play) — hech kim tegmasa stol o'zi o'ynaydi.
 *
 * Toza funksiya: dunyoni o'zgartirmaydi, faqat zarbani tanlaydi. Tanlov
 * "ghost ball" usulida: biток→ghost va soqqa→teshik yo'llari toza bo'lgan,
 * kesish burchagi o'tkir bo'lmagan potlar orasidan eng qulayi. Kuch sirpanish
 * va dumalash ishqalanishini hisobga olib binar qidiruv bilan topiladi —
 * soqqa teshikkacha yetib, ortiqcha uchib ketmaydi.
 */
import { G, PHYS, R, cueBall, liveObjectBalls, type Ball, type World } from './physics';

export interface Shot {
  dirX: number;
  dirY: number;
  speed: number;
  side: number;
  vertical: number;
  /** Zarba turi — razbiy, pot yoki shunchaki yoyish */
  kind: 'break' | 'pot' | 'safety';
}

const A_SLIDE = PHYS.muSlide * G;
const A_ROLL = PHYS.muRoll * G;

/** Aylanishsiz chiqqan shar `v0` tezlikdan to'xtaguncha bosadigan yo'l */
const travel = (v0: number): number => {
  const vRoll = (5 / 7) * v0;
  const slideDist = (v0 * v0 - vRoll * vRoll) / (2 * A_SLIDE);
  return slideDist + (vRoll * vRoll) / (2 * A_ROLL);
};

/** `dist` masofadan keyin qolgan tezlik (aylanishsiz boshlangan shar uchun) */
const speedAfter = (v0: number, dist: number): number => {
  const vRoll = (5 / 7) * v0;
  const slideDist = (v0 * v0 - vRoll * vRoll) / (2 * A_SLIDE);
  if (dist <= slideDist) return Math.sqrt(Math.max(0, v0 * v0 - 2 * A_SLIDE * dist));
  return Math.sqrt(Math.max(0, vRoll * vRoll - 2 * A_ROLL * (dist - slideDist)));
};

/** Monoton funksiya uchun eng kichik v: f(v) ≥ need */
const solve = (f: (v: number) => number, need: number, lo = 1, hi: number = PHYS.maxSpeed): number => {
  if (f(hi) < need) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= need) hi = mid;
    else lo = mid;
  }
  return hi;
};

const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
};

const pathClear = (balls: Ball[], ax: number, ay: number, bx: number, by: number, skip: Ball[]) =>
  balls.every((b) => skip.includes(b) || segDist(b.x, b.y, ax, ay, bx, by) > 2 * R - 0.08);

interface Candidate {
  dirX: number;
  dirY: number;
  speed: number;
  score: number;
}

export const planShot = (world: World, rng: () => number): Shot | null => {
  const cue = cueBall(world);
  const targets = liveObjectBalls(world);
  if (!cue || targets.length === 0) return null;
  const live = world.balls.filter((b) => b.phase === 'live');
  const noise = () => (rng() + rng() + rng() - 1.5) * 0.004;

  // Razbiy: piramida cho'qqisiga kuchli zarba, ozgina chetroqdan
  if (world.shots === 0) {
    const apex = targets.reduce((a, b) => (b.x < a.x ? b : a));
    const offset = (rng() - 0.5) * 0.5;
    return {
      dirX: apex.x - cue.x,
      dirY: apex.y + offset - cue.y,
      speed: 96 + rng() * 18,
      side: 0,
      vertical: -0.1,
      kind: 'break',
    };
  }

  const candidates: Candidate[] = [];
  for (const t of targets) {
    for (const p of world.table.pockets) {
      const tpx = p.aimX - t.x;
      const tpy = p.aimY - t.y;
      const tp = Math.hypot(tpx, tpy);
      if (tp < 0.5) continue;
      const ux = tpx / tp;
      const uy = tpy / tp;
      // O'rta teshikka faqat "yuzma-yuz" kelgan shar tushadi (jag'ga urilmasin)
      if (!p.corner && Math.abs(uy) < 0.6) continue;
      const gx = t.x - ux * 2 * R;
      const gy = t.y - uy * 2 * R;
      const cgx = gx - cue.x;
      const cgy = gy - cue.y;
      const cg = Math.hypot(cgx, cgy);
      if (cg < 0.5) continue;
      const cos = (cgx * ux + cgy * uy) / cg;
      if (cos < 0.34) continue;
      if (!pathClear(live, cue.x, cue.y, gx, gy, [cue, t])) continue;
      if (!pathClear(live, t.x, t.y, p.aimX, p.aimY, [cue, t])) continue;

      // Soqqa teshikka ~8 R/s qoldiq tezlik bilan yetib borsin
      const vObj = solve((v) => speedAfter(v, tp + 1.5), 8);
      const transfer = (cos * (1 + PHYS.eBall)) / 2;
      const vContact = vObj / transfer;
      const v0 = solve((v) => speedAfter(v, cg), vContact) * 1.04;
      if (v0 > 95 || travel(v0) < cg) continue;
      candidates.push({
        dirX: cgx / cg,
        dirY: cgy / cg,
        speed: Math.max(14, v0),
        score: tp + cg * 0.45 + (1 - cos) * 38 + (p.corner ? 0 : 5),
      });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.score - b.score);
    const roll = rng();
    const pick = candidates[Math.min(candidates.length - 1, roll < 0.65 ? 0 : roll < 0.9 ? 1 : 2)];
    const angle = Math.atan2(pick.dirY, pick.dirX) + noise();
    const style = rng();
    return {
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
      speed: pick.speed,
      side: style > 0.85 ? (rng() - 0.5) * 0.5 : 0,
      vertical: style < 0.3 ? -0.3 : style < 0.65 ? 0 : 0.28,
      kind: 'pot',
    };
  }

  // Toza pot yo'q — eng yaqin soqqaga o'rtacha zarba (pakni yoyish)
  const nearest = targets.reduce((a, b) =>
    Math.hypot(b.x - cue.x, b.y - cue.y) < Math.hypot(a.x - cue.x, a.y - cue.y) ? b : a,
  );
  const angle = Math.atan2(nearest.y - cue.y, nearest.x - cue.x) + (rng() - 0.5) * 0.06;
  return {
    dirX: Math.cos(angle),
    dirY: Math.sin(angle),
    speed: 32 + rng() * 22,
    side: 0,
    vertical: 0.1,
    kind: 'safety',
  };
};
