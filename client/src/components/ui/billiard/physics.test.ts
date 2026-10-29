import { describe, expect, it } from 'vitest';
import { planShot } from './ai';
import {
  G,
  PHYS,
  R,
  collideBalls,
  collideSegment,
  createRng,
  createWorld,
  isSettled,
  kineticEnergy,
  rackBalls,
  step,
  strike,
  type Ball,
  type World,
} from './physics';

const ball = (id: number, x: number, y: number, vx = 0, vy = 0): Ball => ({
  id,
  x,
  y,
  vx,
  vy,
  wx: 0,
  wy: 0,
  wz: 0,
  q: [1, 0, 0, 0],
  phase: 'live',
  sink: 0,
  pocket: -1,
});

/** Bitta biток qolgan bo'sh stol */
const lonely = (x: number, y: number): World => {
  const world = createWorld(createRng(1));
  world.balls = [ball(0, x, y)];
  world.shots = 1;
  return world;
};

const run = (world: World, seconds: number, each?: () => void) => {
  const steps = Math.round(seconds / PHYS.dt);
  for (let i = 0; i < steps; i++) {
    step(world);
    each?.();
  }
};

const maxOverlap = (world: World): number => {
  const live = world.balls.filter((b) => b.phase === 'live');
  let worst = 0;
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const d = Math.hypot(live[j].x - live[i].x, live[j].y - live[i].y);
      worst = Math.max(worst, 2 * R - d);
    }
  }
  return worst;
};

describe('shar–shar to\'qnashuvi', () => {
  it('bosh zarbada impuls saqlanadi va restitutsiya ≈ 0.94', () => {
    const a = ball(0, 10, 10, 30, 0);
    const b = ball(1, 11.99, 10);
    const before = { x: a.vx + b.vx, y: a.vy + b.vy };
    expect(collideBalls(a, b)).toBe(true);
    expect(a.vx + b.vx).toBeCloseTo(before.x, 10);
    expect(a.vy + b.vy).toBeCloseTo(before.y, 10);
    // Ajralish tezligi = e · yaqinlashish tezligi
    expect(b.vx - a.vx).toBeCloseTo(PHYS.eBall * 30, 6);
    expect(a.vx).toBeGreaterThan(0); // e < 1: zarb shari ozgina oldinga ketadi
  });

  it('kesik zarbada ham impuls saqlanadi, energiya ortmaydi', () => {
    const a = ball(0, 10, 10, 30, 6);
    const b = ball(1, 11.3, 11.48);
    a.wz = 25; // vint bilan — throw impulsi ham hisobga olinsin
    const energy = (s: Ball[]) =>
      s.reduce((e, o) => e + 0.5 * (o.vx ** 2 + o.vy ** 2) + 0.5 * 0.4 * (o.wx ** 2 + o.wy ** 2 + o.wz ** 2), 0);
    const p0 = { x: a.vx + b.vx, y: a.vy + b.vy };
    const e0 = energy([a, b]);
    expect(collideBalls(a, b)).toBe(true);
    expect(a.vx + b.vx).toBeCloseTo(p0.x, 10);
    expect(a.vy + b.vy).toBeCloseTo(p0.y, 10);
    expect(energy([a, b])).toBeLessThanOrEqual(e0 + 1e-9);
    // Soqqa markazlar chizig'i bo'ylab ketadi (throw ozgina buradi, xolos)
    const nx = 1.3 / Math.hypot(1.3, 1.48);
    const ny = 1.48 / Math.hypot(1.3, 1.48);
    const cos = (b.vx * nx + b.vy * ny) / Math.hypot(b.vx, b.vy);
    expect(cos).toBeGreaterThan(0.99);
  });
});

describe('sirpanish va dumalash', () => {
  it('markazdan urilgan shar sirpanadi, so\'ng 5/7 tezlikda dumalashga o\'tadi', () => {
    const world = lonely(8, 13);
    strike(world, 1, 0, 40);
    const cue = world.balls[0];
    const slipOf = () => Math.hypot(cue.vx + R * cue.wy, cue.vy - R * cue.wx);
    expect(slipOf()).toBeGreaterThan(30);

    let t = 0;
    while (slipOf() > 1e-6 && t < 2) {
      step(world);
      t += PHYS.dt;
    }
    const vRoll = Math.hypot(cue.vx, cue.vy);
    expect(vRoll).toBeCloseTo((5 / 7) * 40, 1);

    // Sirpanishdagi sekinlanish ≈ μs·g, dumalashdagi — undan ancha kichik
    const slideDecel = (40 - vRoll) / t;
    expect(slideDecel).toBeGreaterThan(PHYS.muSlide * G * 0.9);
    expect(slideDecel).toBeLessThan(PHYS.muSlide * G * 1.1);

    run(world, 0.5);
    const rollDecel = (vRoll - Math.hypot(cue.vx, cue.vy)) / 0.5;
    expect(rollDecel).toBeGreaterThan(0);
    expect(rollDecel).toBeLessThan(slideDecel / 5);
    expect(rollDecel).toBeCloseTo(PHYS.muRoll * G, 0);
  });

  it('оттяжка: to\'xtagan biток orqaga aylanishi hisobiga qaytadi', () => {
    const world = createWorld(createRng(3));
    const cue = ball(0, 10, 13);
    const obj = ball(1, 20, 13);
    world.balls = [cue, obj];
    world.shots = 1;
    strike(world, 1, 0, 45, 0, -0.5);
    run(world, 3);
    expect(cue.x).toBeLessThan(18.5); // urilish nuqtasidan orqaga qaytgan
    expect(obj.x).toBeGreaterThan(25);
  });
});

describe('bortlar va teshiklar', () => {
  const topCushion = { ax: 2.3, ay: 0, bx: 22.95, by: 0 };

  it('to\'g\'ri zarbada restitutsiya tezlikka bog\'liq va me\'yorda', () => {
    for (const speed of [8, 30, 90]) {
      const b = ball(0, 12, 0.98, 0, -speed);
      expect(collideSegment(b, topCushion)).toBe(true);
      const e = b.vy / speed;
      expect(e).toBeGreaterThanOrEqual(PHYS.eCushionFast - 1e-9);
      expect(e).toBeLessThanOrEqual(PHYS.eCushionSlow + 1e-9);
    }
    const slow = ball(0, 12, 0.98, 0, -8);
    const fast = ball(0, 12, 0.98, 0, -90);
    collideSegment(slow, topCushion);
    collideSegment(fast, topCushion);
    expect(slow.vy / 8).toBeGreaterThan(fast.vy / 90);
  });

  it('45° kelgan shar aql bovar qiladigan burchakda qaytadi, vint burchakni o\'zgartiradi', () => {
    const plain = ball(0, 12, 0.98, 20, -20);
    collideSegment(plain, topCushion);
    const angle = (Math.atan2(Math.abs(plain.vx), plain.vy) * 180) / Math.PI;
    expect(angle).toBeGreaterThan(30);
    expect(angle).toBeLessThan(60);

    const left = ball(0, 12, 0.98, 20, -20);
    left.wz = 20;
    const right = ball(0, 12, 0.98, 20, -20);
    right.wz = -20;
    collideSegment(left, topCushion);
    collideSegment(right, topCushion);
    expect(left.vx).not.toBeCloseTo(right.vx, 1);
  });

  it('burchak teshigiga aniq yo\'naltirilgan shar tushadi', () => {
    const world = lonely(10, 10);
    const pocket = world.table.pockets[0];
    strike(world, pocket.x - 10, pocket.y - 10, 40);
    run(world, 3);
    expect(world.balls[0].phase).not.toBe('live');
    expect(world.pocketed).toContain(0);
  });

  it('jag\'ga urilgan shar tushmaydi, qaytib chiqadi', () => {
    const world = lonely(0, 0);
    const { L } = world.table;
    const cue = world.balls[0];
    // O'rta teshikning chap jag'i (L/2 − 2.05, 0) — markaz undan 0.45 o'ngda
    cue.x = L / 2 - 1.6;
    cue.y = 10;
    strike(world, 0, -1, 40, 0, 0.4);
    run(world, 2);
    expect(cue.phase).toBe('live');
    expect(cue.y).toBeGreaterThan(1);
  });
});

describe('razbiy simulyatsiyasi', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}: kirishish yo'q, energiya ortmaydi, hammasi to'xtaydi`, () => {
      const rng = createRng(seed);
      const world = createWorld(rng);
      const shot = planShot(world, rng);
      expect(shot?.kind).toBe('break');
      strike(world, shot!.dirX, shot!.dirY, shot!.speed, shot!.side, shot!.vertical);

      let prev = kineticEnergy(world);
      let worstOverlap = 0;
      let rose = 0;
      let settledAt = -1;
      run(world, 60, () => {
        worstOverlap = Math.max(worstOverlap, maxOverlap(world));
        const e = kineticEnergy(world);
        if (e > prev * (1 + 1e-9) + 1e-9) rose = Math.max(rose, e - prev);
        prev = e;
        if (settledAt < 0 && isSettled(world)) settledAt = world.time;
      });
      expect(worstOverlap).toBeLessThan(1e-3);
      expect(rose).toBe(0);
      expect(settledAt).toBeGreaterThan(0);
      expect(isSettled(world)).toBe(true);
      // Sharlar stol ichida (yoki teshikda)
      for (const b of world.balls) {
        if (b.phase !== 'live') continue;
        expect(b.x).toBeGreaterThanOrEqual(R - 1e-6);
        expect(b.x).toBeLessThanOrEqual(world.table.L - R + 1e-6);
        expect(b.y).toBeGreaterThanOrEqual(R - 1e-6);
        expect(b.y).toBeLessThanOrEqual(world.table.B - R + 1e-6);
      }
    });
  }

  it('bir xil seed — bir xil natija (determinik)', () => {
    const play = () => {
      const rng = createRng(42);
      const world = createWorld(rng);
      for (let shot = 0; shot < 3; shot++) {
        const s = planShot(world, rng);
        if (!s) break;
        strike(world, s.dirX, s.dirY, s.speed, s.side, s.vertical);
        run(world, 12);
      }
      return world.balls.map((b) => [b.id, b.phase, b.x, b.y]);
    };
    expect(play()).toEqual(play());
  });

  it('AI ketma-ket zarbalarda soqqalarni tushira oladi', () => {
    const rng = createRng(7);
    const world = createWorld(rng);
    let potted = 0;
    for (let shot = 0; shot < 12; shot++) {
      if (world.balls.every((b) => b.id !== 0 || b.phase !== 'live')) break;
      const s = planShot(world, rng);
      if (!s) break;
      strike(world, s.dirX, s.dirY, s.speed, s.side, s.vertical);
      run(world, 15);
      potted += world.pocketed.filter((id) => id !== 0).length;
      if (world.balls.find((b) => b.id === 0)?.phase !== 'live') rackBalls(world, rng);
    }
    expect(potted).toBeGreaterThan(2);
  });
});
