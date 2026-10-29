import { describe, expect, it } from 'vitest';
import {
  CHARGE_FULL_MS,
  SPIN_MAX,
  TAP_POWER,
  aimGap,
  chargePower,
  clampSpinPoint,
  cuePathAfterContact,
  powerToSpeed,
  shakeAmplitude,
  shakeOffset,
  spinFromPoint,
  strikeDuration,
} from './controls';
import { PHYS, R, castAim, createRng, createWorld, step, strike, type Ball, type World } from './physics';
import { createRateLimiter, impactGain } from './sound';

const ball = (id: number, x: number, y: number): Ball => ({
  id,
  x,
  y,
  vx: 0,
  vy: 0,
  wx: 0,
  wy: 0,
  wz: 0,
  q: [1, 0, 0, 0],
  phase: 'live',
  sink: 0,
  pocket: -1,
});

const worldWith = (balls: Ball[], listen = true): World => {
  const world = createWorld(createRng(5));
  world.balls = balls;
  world.shots = 1;
  if (listen) world.events = [];
  return world;
};

const run = (world: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / PHYS.dt); i++) step(world);
};

describe('bosib turish — kuch', () => {
  it('bir zumlik bosish ham yumshoq zarba, to\'liq vaqtda 100%', () => {
    expect(chargePower(0)).toBeCloseTo(TAP_POWER, 10);
    expect(chargePower(60)).toBeGreaterThan(TAP_POWER);
    expect(chargePower(60)).toBeLessThan(0.2);
    expect(chargePower(CHARGE_FULL_MS)).toBe(1);
    expect(chargePower(CHARGE_FULL_MS * 3)).toBe(1);
    expect(chargePower(-50)).toBeCloseTo(TAP_POWER, 10);
  });

  it('kuch vaqt bilan monoton o\'sadi, boshida sekinroq (nazorat aniq)', () => {
    let prev = -1;
    for (let ms = 0; ms <= CHARGE_FULL_MS; ms += 25) {
      const p = chargePower(ms);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    const firstHalf = chargePower(CHARGE_FULL_MS / 2) - chargePower(0);
    const secondHalf = chargePower(CHARGE_FULL_MS) - chargePower(CHARGE_FULL_MS / 2);
    expect(firstHalf).toBeLessThan(secondHalf);
  });

  it('kuch → tezlik: 100% stol ruxsat bergan eng kuchli zarba, yumshog\'i ham joyidan siljitadi', () => {
    expect(powerToSpeed(1)).toBeCloseTo(PHYS.maxSpeed, 10);
    expect(powerToSpeed(TAP_POWER)).toBeGreaterThan(8);
    expect(powerToSpeed(TAP_POWER)).toBeLessThan(25);
    expect(powerToSpeed(0.5)).toBeLessThan(powerToSpeed(0.6));
    expect(powerToSpeed(2)).toBeCloseTo(PHYS.maxSpeed, 10);
  });

  it('kiy kuch bilan orqaga tortiladi, kuchli zarba tezroq uriladi', () => {
    expect(aimGap(1)).toBeGreaterThan(aimGap(0.2));
    expect(aimGap(0)).toBeGreaterThan(0);
    expect(strikeDuration(1)).toBeLessThan(strikeDuration(0.1));
    expect(strikeDuration(1)).toBeGreaterThanOrEqual(60);
  });

  it('silkinish faqat juda kuchli zarbada va tez so\'nadi', () => {
    expect(shakeAmplitude(0.7)).toBe(0);
    expect(shakeAmplitude(1)).toBeGreaterThan(0);
    expect(shakeAmplitude(1)).toBeLessThanOrEqual(3);
    expect(shakeOffset(shakeAmplitude(1), 250)).toEqual({ x: 0, y: 0 });
    const early = shakeOffset(2.5, 10);
    expect(Math.hypot(early.x, early.y)).toBeLessThanOrEqual(2.5);
  });
});

describe('vint vidjeti', () => {
  it('nuqta doiradan chiqmaydi', () => {
    expect(clampSpinPoint(0.3, -0.4)).toEqual({ x: 0.3, y: -0.4 });
    const p = clampSpinPoint(3, 4);
    expect(p.x).toBeCloseTo(0.6, 10);
    expect(p.y).toBeCloseTo(0.8, 10);
  });

  it('yuqori — nakat, past — ottyajka, o\'ng — o\'ng vint; markaz — vintsiz', () => {
    expect(spinFromPoint(0, 0)).toEqual({ side: 0, vertical: 0 });
    expect(spinFromPoint(0, -1)).toEqual({ side: 0, vertical: SPIN_MAX });
    expect(spinFromPoint(0, 1)).toEqual({ side: 0, vertical: -SPIN_MAX });
    expect(spinFromPoint(1, 0).side).toBeCloseTo(SPIN_MAX, 10);
    const far = spinFromPoint(5, 0);
    expect(far.side).toBeCloseTo(SPIN_MAX, 10);
    // Fizika ±0.6 R dan ortig'ini qabul qilmaydi — vidjet undan oshmaydi
    expect(SPIN_MAX).toBeLessThanOrEqual(0.6);
  });

  it('biток yo\'li: to\'liq zarbada vintsiz to\'xtaydi, nakatda oldinga, ottyajkada orqaga', () => {
    const cue = ball(0, 10, 13);
    const obj = ball(1, 20, 13);
    const world = worldWith([cue, obj], false);
    const aim = castAim(world, 1, 0);
    expect(aim?.target?.id).toBe(1);
    expect(cuePathAfterContact(aim!, 1, 0, 0).share).toBeLessThan(0.05);
    const follow = cuePathAfterContact(aim!, 1, 0, SPIN_MAX);
    expect(follow.x).toBeGreaterThan(0.99);
    const draw = cuePathAfterContact(aim!, 1, 0, -SPIN_MAX);
    expect(draw.x).toBeLessThan(-0.99);
  });

  it('kesik zarbada vintsiz biток urinma bo\'ylab ketadi, nakat uni oldinga egadi', () => {
    const cue = ball(0, 10, 13);
    const obj = ball(1, 20, 14.2);
    const world = worldWith([cue, obj], false);
    const aim = castAim(world, 1, 0)!;
    const stun = cuePathAfterContact(aim, 1, 0, 0);
    expect(stun.x * aim.objX + stun.y * aim.objY).toBeCloseTo(0, 6);
    const follow = cuePathAfterContact(aim, 1, 0, SPIN_MAX);
    expect(follow.x).toBeGreaterThan(stun.x);
  });

  it('pastki vint (ottyajka) haqiqatan biтокni orqaga qaytaradi — bashorat bilan bir xil', () => {
    const cue = ball(0, 10, 13);
    const obj = ball(1, 18, 13);
    const world = worldWith([cue, obj], false);
    const { side, vertical } = spinFromPoint(0, 1);
    strike(world, 1, 0, powerToSpeed(0.45), side, vertical);
    run(world, 4);
    expect(cue.x).toBeLessThan(15);
  });
});

describe('fizika hodisalari (ovoz uchun)', () => {
  it('shar–shar, bort va teshik hodisalari yoziladi', () => {
    const cue = ball(0, 10, 13);
    const obj = ball(1, 16, 13);
    const world = worldWith([cue, obj]);
    strike(world, 1, 0, 60);
    run(world, 3);
    const kinds = new Set(world.events!.map((e) => e.kind));
    expect(kinds.has('ball')).toBe(true);
    expect(kinds.has('cushion')).toBe(true);
    const hit = world.events!.find((e) => e.kind === 'ball');
    expect(hit && 'speed' in hit && hit.speed).toBeGreaterThan(30);

    const potWorld = worldWith([ball(0, 10, 10)]);
    const pocket = potWorld.table.pockets[0];
    strike(potWorld, pocket.x - 10, pocket.y - 10, 40);
    run(potWorld, 3);
    expect(potWorld.events!.some((e) => e.kind === 'pocket' && e.id === 0 && e.pocket === 0)).toBe(true);
  });

  it('navbat berilmasa hech narsa yozilmaydi va natija o\'zgarmaydi', () => {
    const play = (listen: boolean) => {
      const world = worldWith([ball(0, 10, 13), ball(1, 16, 13.4), ball(2, 30, 8)], listen);
      strike(world, 1, 0.05, 70, 0.2, -0.3);
      run(world, 6);
      return { world, state: world.balls.map((b) => [b.phase, b.x, b.y]) };
    };
    const silent = play(false);
    const heard = play(true);
    expect(silent.world.events).toBeUndefined();
    expect(heard.state).toEqual(silent.state);
  });

  it('tinch turgan sharlar shovqin qilmaydi, navbat cheksiz o\'smaydi', () => {
    const world = worldWith([ball(0, 10, 13), ball(1, 12 + 1e-3, 13), ball(2, 3, R + 1e-3)]);
    run(world, 1);
    expect(world.events).toEqual([]);
    const busy = worldWith([ball(0, 10, 13), ball(1, 16, 13)]);
    for (let i = 0; i < 400; i++) busy.events!.push({ kind: 'ball', speed: 5, x: 0, y: 0 });
    strike(busy, 1, 0, 80);
    run(busy, 1);
    expect(busy.events!.length).toBeLessThanOrEqual(400);
  });
});

describe('ovoz yordamchilari', () => {
  it('balandlik urilish tezligiga mutanosib va 0..1 oralig\'ida', () => {
    expect(impactGain(0, 70)).toBe(0);
    expect(impactGain(35, 70)).toBeGreaterThan(0.3);
    expect(impactGain(35, 70)).toBeLessThan(impactGain(60, 70));
    expect(impactGain(500, 70)).toBe(1);
  });

  it('cheklagich oynada ko\'pi bilan N ta tovushga ruxsat beradi', () => {
    const allow = createRateLimiter(2, 50);
    expect(allow(0)).toBe(true);
    expect(allow(10)).toBe(true);
    expect(allow(20)).toBe(false);
    expect(allow(61)).toBe(true);
  });
});
