import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { TOKENS } from '../../theme/tokens';
import { planShot, type Shot } from './billiard/ai';
import {
  PHYS,
  castAim,
  createRng,
  createTable,
  createWorld,
  cueBall,
  isSettled,
  liveObjectBalls,
  rackBalls,
  respawnCue,
  step,
  strike,
} from './billiard/physics';
import { buildTableLayer, computeView, drawScene, toWorld, type CuePose, type GuideDraw } from './billiard/render';

const { gold, text } = TOKENS.color;

/**
 * Interaktiv RUS BILYARDI (piramida) stoli — haqiqiy fizika, protsedural grafika.
 *
 * Fizika (billiard/physics.ts): belgilangan qadam (240 Hz), sirpanish → dumalash,
 * vint, tezlikka bog'liq bortlar, magnitsiz teshiklar. Grafika (billiard/render.ts):
 * yog'och bort, donador mato, lampa yorug'i, hajmli sharlar va aylanadigan raqamlar.
 *
 * O'yin: sichqoncha/barmoq bilan mo'ljal olinadi — biтокdan uzoqlashgan sari
 * kuch ortadi, qo'yib yuborilganda kiy uradi. Hech kim tegmasa stol o'zi
 * o'ynaydi (amaliy siltashlar bilan). Ekrandan chiqsa yoki tab yashirilsa —
 * sikl to'xtaydi. prefers-reduced-motion: statik terilgan piramida.
 */

interface BilliardTableProps {
  style?: CSSProperties;
  className?: string;
  hint?: string;
  /** Ekran o'quvchi uchun nom — matn tarjimasi chaqiruvchi sahifadan keladi (hint kabi) */
  ariaLabel?: string;
}

/** Kiy animatsiyasi vaqtlari, ms */
const USER_STRIKE_MS = 110;
const AI_FADE_MS = 260;
const AI_PRACTICE_MS = 640;
const AI_BACKSWING_MS = 340;
const AI_STRIKE_MS = 85;
const FOLLOW_MS = 130;
const FADE_MS = 460;
/** Shuncha vaqt hech kim tegmasa — namoyish o'yini davom etadi */
const IDLE_BEFORE_AI_MS = 2600;
/** Foydalanuvchi o'zi urgan bo'lsa — keyingi zarbasi uchun ko'proq vaqt */
const IDLE_AFTER_USER_MS = 5200;

const TABLE = createTable();
const ASPECT = `${TABLE.outerW} / ${TABLE.outerH}`;

/** Kuch (0..1) → kiy uchining shardan uzoqligi */
const aimGap = (power: number) => 0.35 + power * 4.2;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Pending {
  dirX: number;
  dirY: number;
  speed: number;
  side: number;
  vertical: number;
  by: 'user' | 'ai';
  start: number;
  hitAt: number;
  power: number;
  fromGap: number;
  x: number;
  y: number;
}

const BilliardTable = ({ style, className, hint, ariaLabel }: BilliardTableProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Harakat o'chirilgan rejimda stol statik — "urib tushiring" maslahati chalg'itardi
  const [showHint, setShowHint] = useState(() => Boolean(hint) && !prefersReducedMotion());
  const hideHint = useRef(() => setShowHint(false));

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = prefersReducedMotion();
    const rng = createRng((Date.now() ^ 0x5bd1e995) >>> 0);
    const world = createWorld(rng);

    const S = {
      view: computeView(world.table, 1, 1, 1),
      layer: null as HTMLCanvasElement | null,
      phase: 'idle' as 'idle' | 'aiming' | 'striking' | 'moving',
      pointer: { x: 0, y: 0, inside: false, pressed: false },
      lastInteract: -Infinity,
      settledAt: 0,
      pending: null as Pending | null,
      lastBy: 'ai' as 'user' | 'ai',
      after: null as { x: number; y: number; dirX: number; dirY: number; at: number } | null,
      acc: 0,
      prev: 0,
      raf: 0,
      inView: true,
      pageVisible: !document.hidden,
    };

    /* ------------------------------------------------------------ Zarba */

    const beginStrike = (shot: Pick<Shot, 'dirX' | 'dirY' | 'speed' | 'side' | 'vertical'>, by: 'user' | 'ai', now: number) => {
      const cue = cueBall(world);
      if (!cue) return;
      const len = Math.hypot(shot.dirX, shot.dirY) || 1;
      const power = clamp01(shot.speed / PHYS.maxSpeed);
      const total = by === 'user' ? USER_STRIKE_MS : AI_FADE_MS + AI_PRACTICE_MS + AI_BACKSWING_MS + AI_STRIKE_MS;
      S.pending = {
        dirX: shot.dirX / len,
        dirY: shot.dirY / len,
        speed: shot.speed,
        side: shot.side,
        vertical: shot.vertical,
        by,
        start: now,
        hitAt: now + total,
        power,
        fromGap: aimGap(power),
        x: cue.x,
        y: cue.y,
      };
      S.after = null;
      S.phase = 'striking';
    };

    /** Foydalanuvchi mo'ljali: yo'nalish — ko'rsatkich tomon, kuch — masofa */
    const userAim = () => {
      const cue = cueBall(world);
      if (!cue) return null;
      const dx = S.pointer.x - cue.x;
      const dy = S.pointer.y - cue.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) return null;
      const power = clamp01((dist - 1.5) / (world.table.L * 0.5));
      return { dirX: dx / dist, dirY: dy / dist, power, speed: 10 + power ** 1.3 * (PHYS.maxSpeed - 15) };
    };

    const canAim = () => {
      // Namoyish zarbasi hali urilmagan bo'lsa — foydalanuvchi darhol o'z qo'liga oladi
      if (S.pending?.by === 'ai') {
        S.pending = null;
        S.phase = 'idle';
      }
      return S.phase !== 'striking' && S.phase !== 'moving' && !!cueBall(world) && isSettled(world);
    };

    /* ----------------------------------------------------------- Holat */

    const update = (now: number, dt: number) => {
      if (S.pending && now >= S.pending.hitAt) {
        const p = S.pending;
        strike(world, p.dirX, p.dirY, p.speed, p.side, p.vertical);
        S.after = { x: p.x, y: p.y, dirX: p.dirX, dirY: p.dirY, at: now };
        S.lastBy = p.by;
        S.pending = null;
        S.phase = 'moving';
      }

      S.acc = Math.min(S.acc + dt, 0.25);
      while (S.acc >= PHYS.dt) {
        step(world);
        S.acc -= PHYS.dt;
      }

      if (S.phase === 'moving' && isSettled(world)) {
        S.phase = 'idle';
        S.settledAt = now;
        if (liveObjectBalls(world).length <= 1) rackBalls(world, rng);
        else if (!cueBall(world)) respawnCue(world);
      }

      if (
        S.phase === 'idle' &&
        !S.pointer.pressed &&
        now - S.lastInteract > (S.lastBy === 'user' ? IDLE_AFTER_USER_MS : IDLE_BEFORE_AI_MS) &&
        now - S.settledAt > 700
      ) {
        const shot = planShot(world, rng);
        if (shot) beginStrike(shot, 'ai', now);
      }
    };

    /** Kiyning joriy holati — mo'ljal, amaliy siltashlar, zarba va yo'qolish */
    const cuePose = (now: number): CuePose | null => {
      const p = S.pending;
      if (p) {
        const t = now - p.start;
        const base = { x: p.x, y: p.y, dirX: p.dirX, dirY: p.dirY };
        if (p.by === 'user') {
          const k = clamp01(t / USER_STRIKE_MS);
          return { ...base, gap: p.fromGap * (1 - k * k), alpha: 1 };
        }
        if (t < AI_FADE_MS) return { ...base, gap: 1.5, alpha: t / AI_FADE_MS };
        if (t < AI_FADE_MS + AI_PRACTICE_MS) {
          const ph = (t - AI_FADE_MS) / AI_PRACTICE_MS;
          return { ...base, gap: 0.9 + 0.6 * Math.cos(ph * Math.PI * 4), alpha: 1 };
        }
        if (t < AI_FADE_MS + AI_PRACTICE_MS + AI_BACKSWING_MS) {
          const k = easeInOut((t - AI_FADE_MS - AI_PRACTICE_MS) / AI_BACKSWING_MS);
          return { ...base, gap: 1.5 + (p.fromGap - 1.5) * k, alpha: 1 };
        }
        const k = clamp01((t - AI_FADE_MS - AI_PRACTICE_MS - AI_BACKSWING_MS) / AI_STRIKE_MS);
        return { ...base, gap: p.fromGap * (1 - k * k), alpha: 1 };
      }
      if (S.after) {
        const t = now - S.after.at;
        if (t < FOLLOW_MS + FADE_MS) {
          return {
            x: S.after.x,
            y: S.after.y,
            dirX: S.after.dirX,
            dirY: S.after.dirY,
            gap: -0.9 * clamp01(t / FOLLOW_MS),
            alpha: t < FOLLOW_MS ? 1 : 1 - (t - FOLLOW_MS) / FADE_MS,
          };
        }
        S.after = null;
      }
      if (S.phase === 'aiming' && S.pointer.inside) {
        const cue = cueBall(world);
        const aim = userAim();
        if (cue && aim) return { x: cue.x, y: cue.y, dirX: aim.dirX, dirY: aim.dirY, gap: aimGap(aim.power), alpha: 1 };
      }
      return null;
    };

    const draw = (now: number) => {
      if (!S.layer) return;
      const cue = cueBall(world);
      let guide: GuideDraw | null = null;
      if (cue && S.phase === 'aiming' && S.pointer.inside) {
        const aim = userAim();
        const info = aim && castAim(world, aim.dirX, aim.dirY);
        if (info) guide = { aim: info, alpha: 1 };
      } else if (cue && S.pending?.by === 'ai') {
        // Namoyishda ham mo'ljal chizig'i — tomoshabin zarbani oldindan ko'radi
        const info = castAim(world, S.pending.dirX, S.pending.dirY);
        const t = now - S.pending.start;
        if (info) guide = { aim: info, alpha: 0.55 * clamp01(t / AI_FADE_MS) * clamp01((S.pending.hitAt - now) / 120) };
      }
      drawScene(ctx, S.layer, world, S.view, { guide, cue: cuePose(now), cueX: cue?.x ?? 0, cueY: cue?.y ?? 0 });
    };

    /* ------------------------------------------------------------ Sikl */

    const frame = (ts: number) => {
      S.raf = 0;
      const dt = S.prev ? Math.min(0.1, (ts - S.prev) / 1000) : 0;
      S.prev = ts;
      update(ts, dt);
      draw(ts);
      S.raf = requestAnimationFrame(frame);
    };

    /** Ko'rinmayotgan stol CPU yemasin: ekrandan chiqsa yoki tab yashirilsa to'xtaydi */
    const sync = () => {
      const run = S.inView && S.pageVisible && !reduce;
      if (run && !S.raf) {
        S.prev = 0;
        S.raf = requestAnimationFrame(frame);
      } else if (!run && S.raf) {
        cancelAnimationFrame(S.raf);
        S.raf = 0;
      }
    };

    const resize = () => {
      // clientWidth/Height — LAYOUT o'lchami: ota elementdagi kirish animatsiyasi
      // (scale 0.96 → 1) transformi uni o'zgartirmaydi. getBoundingClientRect esa
      // transformni hisobga olardi va canvas 4% tor bo'lib, o'ng cheti kesilib qolardi
      // (transform tugaganda ResizeObserver qayta ishga tushmaydi).
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, wrap.clientWidth);
      const h = Math.max(1, wrap.clientHeight);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      S.view = computeView(world.table, w, h, dpr);
      S.layer = buildTableLayer(world.table, S.view);
      // Yog'och korpus burchagi bilan bir xil radius — soya to'g'ri tushsin
      wrap.style.borderRadius = `${1.8 * S.view.s}px`;
      if (!S.raf) draw(performance.now());
    };

    /* --------------------------------------------------------- Ko'rsatkich */

    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      // Kirish animatsiyasidagi scale ham hisobga olinsin
      const px = ((e.clientX - rect.left) * S.view.w) / (rect.width || 1);
      const py = ((e.clientY - rect.top) * S.view.h) / (rect.height || 1);
      const p = toWorld(S.view, px, py);
      S.pointer.x = p.x;
      S.pointer.y = p.y;
      S.pointer.inside = true;
      S.lastInteract = performance.now();
    };
    const onMove = (e: PointerEvent) => {
      toLocal(e);
      if (canAim()) S.phase = 'aiming';
    };
    const onDown = (e: PointerEvent) => {
      toLocal(e);
      S.pointer.pressed = true;
      hideHint.current();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* eski brauzer — capture'siz ham ishlaydi */
      }
      if (canAim()) S.phase = 'aiming';
    };
    const onUp = (e: PointerEvent) => {
      if (!S.pointer.pressed) return;
      toLocal(e);
      S.pointer.pressed = false;
      if (S.phase === 'aiming' && canAim()) {
        const aim = userAim();
        if (aim) beginStrike({ ...aim, side: 0, vertical: 0.15 }, 'user', performance.now());
      }
      if (e.pointerType !== 'mouse') S.pointer.inside = false;
    };
    const onLeave = () => {
      if (S.pointer.pressed) return;
      S.pointer.inside = false;
      if (S.phase === 'aiming') S.phase = 'idle';
    };
    const onCancel = () => {
      S.pointer.pressed = false;
      S.pointer.inside = false;
      if (S.phase === 'aiming') S.phase = 'idle';
    };
    const onVisibility = () => {
      S.pageVisible = !document.hidden;
      sync();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const io =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(
            ([entry]) => {
              S.inView = entry.isIntersecting;
              sync();
            },
            { threshold: 0.01 },
          )
        : null;
    io?.observe(wrap);
    document.addEventListener('visibilitychange', onVisibility);
    if (!reduce) {
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointerleave', onLeave);
      canvas.addEventListener('pointercancel', onCancel);
    }
    sync();

    return () => {
      if (S.raf) cancelAnimationFrame(S.raf);
      S.raf = 0;
      ro.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointercancel', onCancel);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{
        position: 'relative',
        aspectRatio: ASPECT,
        borderRadius: TOKENS.radius.lg,
        boxShadow: '0 40px 90px rgba(0, 0, 0, 0.6), 0 12px 24px rgba(0, 0, 0, 0.35)',
        cursor: 'crosshair',
        // Vertikal surish sahifani aylantiradi (telefonda stol "tuzoq" bo'lmasin),
        // bosish va gorizontal tortish — mo'ljal
        touchAction: 'pan-y',
        userSelect: 'none',
        ...style,
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      {hint && showHint && (
        <span
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '9%',
            transform: 'translateX(-50%)',
            padding: '6px 14px',
            borderRadius: TOKENS.radius.pill,
            background: 'rgba(14, 21, 19, 0.72)',
            border: `1px solid ${gold.line}`,
            color: text.primary,
            fontSize: 12.5,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            pointerEvents: 'none',
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
};

export default BilliardTable;
