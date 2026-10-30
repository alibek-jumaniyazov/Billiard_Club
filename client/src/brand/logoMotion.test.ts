import { describe, expect, it } from 'vitest';
import {
  ASSEMBLED_TIMELINE,
  MARK,
  TIMELINE,
  introEvents,
  markBoxAt,
  markStateAt,
  settledAt,
  type IntroScene,
} from './logoMotion';

const scene = (overrides: Partial<IntroScene> = {}): IntroScene => ({
  width: 1280,
  height: 800,
  pixelRatio: 1,
  build: { x: 525, y: 285, size: 230 },
  lockup: {
    mark: { x: 300, y: 324, size: 152 },
    word: { x: 495, baseline: 420, size: 58, align: 'left', lines: 1 },
  },
  reveal: 'behind',
  fonts: { display: 'sans-serif', text: 'sans-serif' },
  ...overrides,
});

describe('logo animatsiyasi (deterministik)', () => {
  it('boshida zal qorong\'i: chiroq o\'chiq, kiy pastda yashirin, sharlar hali yo\'q', () => {
    const st = markStateAt(0);
    expect(st.lamp).toBe(0);
    expect(st.rim).toBe(0);
    expect(st.cueY).toBeGreaterThanOrEqual(39.9);
    expect(st.ballA.visible).toBe(false);
    expect(st.ballB.visible).toBe(false);
    expect(st.kiss).toBe(-1);
  });

  it('oxirida belgi aynan logotip geometriyasida turadi', () => {
    const st = markStateAt(settledAt(TIMELINE));
    expect(st.lamp).toBeCloseTo(1, 2);
    expect(st.rim).toBe(1);
    expect(st.cueY).toBeCloseTo(0, 6);
    expect(st.ballA.x).toBeCloseTo(MARK.ballA.x, 3);
    expect(st.ballA.y).toBeCloseTo(MARK.ballA.y, 3);
    expect(st.ballB.x).toBeCloseTo(MARK.ballB.x, 3);
    expect(st.ballB.y).toBeCloseTo(MARK.ballB.y, 3);
  });

  it('sharlar o\'ngdan kelib sekinlashadi va kiyga tezligi bilan uriladi', () => {
    const [t0, t1] = TIMELINE.ballB;
    const early = markStateAt(t0 + 0.05).ballB;
    const late = markStateAt(t1 - 0.02).ballB;
    expect(early.x).toBeGreaterThan(late.x);
    expect(Math.abs(early.vx)).toBeGreaterThan(Math.abs(late.vx));
    expect(Math.abs(late.vx)).toBeGreaterThan(0);
  });

  it('sharlar tegishi chaqnashi faqat tegish paytida', () => {
    const kiss = introEvents().kiss;
    expect(markStateAt(kiss - 0.01).kiss).toBe(-1);
    expect(markStateAt(kiss + 0.1).kiss).toBeGreaterThan(0);
    expect(markStateAt(kiss + 0.5).kiss).toBe(-1);
  });

  it('lahzalar to\'g\'ri tartibda (ovoz shu vaqtlarga bog\'langan)', () => {
    const e = introEvents();
    expect(e.lampTicks.length).toBeGreaterThan(1);
    expect(Math.max(...e.lampTicks)).toBeLessThan(e.cueLand);
    expect(e.cueLand).toBeLessThan(e.ballBDock);
    expect(e.ballBDock).toBeLessThan(e.kiss);
    expect(e.kiss).toBeLessThan(e.sheen[0]);
    expect(e.sheen[0]).toBeLessThan(e.settled);
  });

  it('Android: belgi tayyor holatdan boshlanadi (tizim splash ekrani davomi)', () => {
    const st = markStateAt(0, ASSEMBLED_TIMELINE);
    expect(st.lamp).toBe(1);
    expect(st.rim).toBe(1);
    expect(st.cueY).toBeCloseTo(0, 6);
    expect(st.ballA.visible && st.ballB.visible).toBe(true);
    expect(st.kiss).toBe(-1);
    expect(settledAt(ASSEMBLED_TIMELINE)).toBeLessThan(1.3);
  });

  it('vertikal kompozitsiyada yozuv kechroq chiqadi', () => {
    expect(settledAt(TIMELINE, 'rise')).toBeGreaterThan(settledAt(TIMELINE, 'behind'));
  });

  it('belgi yig\'ilish joyidan yakuniy joyga, so\'ng sahifadagi logotip o\'rniga o\'tadi', () => {
    const s = scene();
    expect(markBoxAt(s, 0)).toEqual(s.build);
    expect(markBoxAt(s, TIMELINE.lockup[1])).toEqual(s.lockup.mark);
    const target = { x: 40, y: 17, size: 34 };
    const landing = scene({ handoff: { at: 3, duration: 0.6, mark: target, word: null } });
    expect(markBoxAt(landing, 3)).toEqual(s.lockup.mark);
    const end = markBoxAt(landing, 3.6);
    expect(end.x).toBeCloseTo(target.x, 6);
    expect(end.y).toBeCloseTo(target.y, 6);
    expect(end.size).toBeCloseTo(target.size, 6);
  });
});
