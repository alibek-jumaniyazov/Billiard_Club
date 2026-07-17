import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { TOKENS } from '../../theme/tokens';

const { emerald, gold, semantic, text } = TOKENS.color;

/**
 * Interaktiv billiard stoli — jonli fizika bilan (canvas 2D).
 *
 *  - Sichqoncha (yoki barmoq) bilan mo'ljal olib, bosib soqqani urasiz;
 *    oq soqqa dumalab boradi, rangli soqqalarga uriladi va teshikka tushadi.
 *  - Foydalanuvchi tegmasa — stol o'zi "namoyish" zarbalarini beradi
 *    (soqqani teshikka aniq tushiradigan mo'ljal bilan), shu bois sahifa
 *    doim jonli ko'rinadi.
 *  - Butun fizika bitta requestAnimationFrame siklida: ishqalanish, devor
 *    (bort) sakrashi, soqqalar to'qnashuvi (elastik) va teshikka tushish.
 *  - prefers-reduced-motion: animatsiya o'chadi — statik terilgan stol qoladi.
 *
 * Ranglar TOKENS palitrasidan olinadi (mato — zumrad, bort — oltin).
 */

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  /** Soqqa raqami (0 — oq zarb soqqasi) */
  n: number;
  cue: boolean;
  /** Teshikka tushish jarayoni: 1 → 0 (kichrayib yo'qoladi) */
  sink: number;
  active: boolean;
}

interface Pocket {
  x: number;
  y: number;
}

/** Nisbiy koordinatalar (0..1) — o'lcham o'zgarganda qayta hisoblanadi */
const RACK: { rx: number; ry: number; color: string; n: number; cue?: boolean }[] = [
  { rx: 0.22, ry: 0.5, color: '#f4f1ea', n: 0, cue: true },
  { rx: 0.6, ry: 0.5, color: gold.base, n: 1 },
  { rx: 0.68, ry: 0.42, color: semantic.info, n: 2 },
  { rx: 0.68, ry: 0.58, color: semantic.error, n: 3 },
  { rx: 0.76, ry: 0.37, color: emerald.glow, n: 4 },
  { rx: 0.76, ry: 0.5, color: '#c76bd6', n: 5 },
  { rx: 0.76, ry: 0.63, color: gold.hover, n: 6 },
];

interface BilliardTableProps {
  style?: CSSProperties;
  className?: string;
  /** Ekranga taklif matni (birinchi zarba/tegishdan so'ng yo'qoladi) */
  hint?: string;
}

const BilliardTable = ({ style, className, hint }: BilliardTableProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showHint, setShowHint] = useState(Boolean(hint));

  // O'zgaruvchan holat ref ichida — RAF sikli qayta render qilmasin
  const stateRef = useRef({
    w: 0,
    h: 0,
    r: 12,
    pocketR: 20,
    margin: 26,
    balls: [] as Ball[],
    pockets: [] as Pocket[],
    pointer: { x: 0, y: 0, inside: false },
    lastInteract: 0,
    lastShotAt: 0,
    reduce: false,
    raf: 0,
    prev: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const S = stateRef.current;
    S.reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /** Stolni qayta terish (boshlang'ich joylashuv) */
    const rack = () => {
      const { w, h } = S;
      S.balls = RACK.map((b) => ({
        x: b.rx * w,
        y: b.ry * h,
        vx: 0,
        vy: 0,
        color: b.color,
        n: b.n,
        cue: Boolean(b.cue),
        sink: 1,
        active: true,
      }));
    };

    /** O'lchamni (DPR bilan) canvasga moslash va geometriyani qayta hisoblash */
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      S.w = w;
      S.h = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      S.r = Math.max(8, Math.min(w, h) * 0.042);
      S.pocketR = S.r * 1.7;
      S.margin = S.pocketR * 0.85;

      const m = S.margin;
      S.pockets = [
        { x: m, y: m },
        { x: w / 2, y: m * 0.7 },
        { x: w - m, y: m },
        { x: m, y: h - m },
        { x: w / 2, y: h - m * 0.7 },
        { x: w - m, y: h - m },
      ];
      if (S.balls.length === 0) rack();
      else {
        // Joylashuvni yangi o'lchamga proporsional siljitamiz
        S.balls.forEach((b) => {
          b.x = Math.min(Math.max(b.x, m + S.r), w - m - S.r);
          b.y = Math.min(Math.max(b.y, m + S.r), h - m - S.r);
        });
      }
      // Harakat kamaytirilgan rejim: sikl yo'q — o'lcham o'zgarganda statik kadrni bir marta chizamiz
      if (S.reduce) draw();
    };

    /** Ikki soqqa markazi orasidagi masofa */
    const dist = (ax: number, ay: number, bx: number, by: number) =>
      Math.hypot(ax - bx, ay - by);

    /** Oq soqqani berilgan yo'nalishda urish */
    const shoot = (dirX: number, dirY: number, power: number) => {
      const cue = S.balls.find((b) => b.cue && b.active);
      if (!cue) return;
      const len = Math.hypot(dirX, dirY) || 1;
      cue.vx = (dirX / len) * power;
      cue.vy = (dirY / len) * power;
      S.lastShotAt = S.prev;
    };

    /** Namoyish zarbasi — soqqani teshikka aniq yo'naltiradigan "ghost ball" mo'ljali */
    const autoShoot = () => {
      const cue = S.balls.find((b) => b.cue && b.active);
      const targets = S.balls.filter((b) => !b.cue && b.active);
      if (!cue || targets.length === 0) return;
      const target = targets[Math.floor((S.prev * 0.001) % targets.length)] || targets[0];
      // Eng qulay teshik — nishon soqqadan chiziq to'sib qolmaganini soddalashtiramiz
      let best = S.pockets[0];
      let bestD = Infinity;
      for (const p of S.pockets) {
        const d = dist(target.x, target.y, p.x, p.y);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      // Ghost ball: nishon soqqa ortidagi nuqta (teshik yo'nalishida)
      const toPocket = { x: best.x - target.x, y: best.y - target.y };
      const pl = Math.hypot(toPocket.x, toPocket.y) || 1;
      const ghostX = target.x - (toPocket.x / pl) * S.r * 2;
      const ghostY = target.y - (toPocket.y / pl) * S.r * 2;
      // Kuch soqqa radiusiga bog'liq (piksel/kadr) — ishqalanish bilan stolni bir necha bor kesib o'tadi
      const power = S.r * 1.15;
      shoot(ghostX - cue.x, ghostY - cue.y, power);
    };

    const allResting = () =>
      S.balls.every((b) => !b.active || Math.hypot(b.vx, b.vy) < 0.06);

    /** Bitta kichik fizika qadami (substep): harakat, ishqalanish, teshik, bort, to'qnashuv */
    const integrate = (dt: number) => {
      const { r, w, h, margin } = S;
      const friction = Math.pow(0.986, dt);
      const rest = 0.82; // bort sakrash energiyasi

      for (const b of S.balls) {
        if (!b.active) continue;
        if (b.sink < 1) {
          // Teshikka tushish animatsiyasi
          b.sink -= dt * 0.06;
          if (b.sink <= 0) b.active = false;
          continue;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vx *= friction;
        b.vy *= friction;
        if (Math.hypot(b.vx, b.vy) < 0.04) {
          b.vx = 0;
          b.vy = 0;
        }

        // Teshikka tushishni tekshirish
        for (const p of S.pockets) {
          if (dist(b.x, b.y, p.x, p.y) < S.pocketR * 0.72) {
            b.sink = 0.999;
            b.vx *= 0.3;
            b.vy *= 0.3;
            break;
          }
        }
        if (b.sink < 1) continue;

        // Bort (devor) sakrashi — teshik yaqinida bo'lmasa
        if (b.x < margin + r) {
          b.x = margin + r;
          b.vx = Math.abs(b.vx) * rest;
        } else if (b.x > w - margin - r) {
          b.x = w - margin - r;
          b.vx = -Math.abs(b.vx) * rest;
        }
        if (b.y < margin + r) {
          b.y = margin + r;
          b.vy = Math.abs(b.vy) * rest;
        } else if (b.y > h - margin - r) {
          b.y = h - margin - r;
          b.vy = -Math.abs(b.vy) * rest;
        }
      }

      // Soqqalar to'qnashuvi (elastik, teng massa)
      const live = S.balls.filter((b) => b.active && b.sink >= 1);
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i];
          const c = live[j];
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const min = r * 2;
          if (d < min) {
            const nx = dx / d;
            const ny = dy / d;
            const overlap = (min - d) / 2;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            c.x += nx * overlap;
            c.y += ny * overlap;
            // Normal bo'ylab tezliklarni almashtirish
            const av = a.vx * nx + a.vy * ny;
            const cv = c.vx * nx + c.vy * ny;
            const diff = cv - av;
            a.vx += diff * nx;
            a.vy += diff * ny;
            c.vx -= diff * nx;
            c.vy -= diff * ny;
          }
        }
      }
    };

    /**
     * Kadr qadami — tez soqqa nishonni "tunnel" qilib o'tib ketmasligi uchun
     * harakatni bir necha kichik substepga bo'lamiz (eng katta tezlik bir
     * substepda soqqa radiusining ~0.4 qismidan oshmasin).
     */
    const step = (dt: number) => {
      let maxV = 0;
      for (const b of S.balls) {
        if (b.active && b.sink >= 1) maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
      }
      const sub = Math.min(8, Math.max(1, Math.ceil((maxV * dt) / (S.r * 0.4))));
      const sdt = dt / sub;
      for (let s = 0; s < sub; s++) integrate(sdt);

      // Namoyish sikli: hamma to'xtagan bo'lsa qayta terish yoki avto-zarba
      const idle = S.prev - S.lastInteract > 4200;
      if (allResting()) {
        const sunk = S.balls.some((b) => !b.active);
        const targets = S.balls.filter((b) => !b.cue && b.active).length;
        if ((sunk || targets === 0) && S.prev - S.lastShotAt > 900) {
          rack();
        } else if (idle && !S.reduce && S.prev - S.lastShotAt > 1200) {
          autoShoot();
        }
      }
    };

    /** Yaltiroq soqqa chizish */
    const drawBall = (b: Ball) => {
      const rr = S.r * b.sink;
      if (rr <= 0.5) return;
      ctx.save();
      // Soya
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + rr * 0.5, rr * 0.95, rr * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fill();
      // Tana — radial gradient
      const g = ctx.createRadialGradient(
        b.x - rr * 0.35,
        b.y - rr * 0.4,
        rr * 0.15,
        b.x,
        b.y,
        rr,
      );
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.28, b.color);
      g.addColorStop(0.9, b.color);
      g.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.beginPath();
      ctx.arc(b.x, b.y, rr, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      // Raqam doirasi (oq soqqada yo'q)
      if (b.n > 0 && b.sink > 0.7) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, rr * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fill();
        ctx.fillStyle = 'rgba(20,18,16,0.85)';
        ctx.font = `700 ${rr * 0.62}px 'Inter Variable', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(b.n), b.x, b.y + rr * 0.02);
      }
      // Yaltirash nuqtasi
      ctx.beginPath();
      ctx.arc(b.x - rr * 0.34, b.y - rr * 0.38, rr * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
      ctx.restore();
    };

    /** Mo'ljal chizig'i va kiy (foydalanuvchi mo'ljal olayotganda) */
    const drawAim = () => {
      if (!S.pointer.inside || S.reduce) return;
      const cue = S.balls.find((b) => b.cue && b.active);
      if (!cue || Math.hypot(cue.vx, cue.vy) > 0.08) return;
      const dx = S.pointer.x - cue.x;
      const dy = S.pointer.y - cue.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;

      // Mo'ljal chizig'i
      ctx.save();
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cue.x + ux * S.r, cue.y + uy * S.r);
      ctx.lineTo(cue.x + ux * Math.min(len, S.w), cue.y + uy * Math.min(len, S.w));
      ctx.stroke();
      ctx.setLineDash([]);

      // Kiy — oq soqqaning orqa tomonida, quvvatga qarab orqaga tortilgan
      const power = Math.min(len, S.w * 0.5);
      const pull = 10 + (power / (S.w * 0.5)) * 26;
      const cueStart = pull + S.r + 6;
      const cueLen = Math.min(S.w, S.h) * 0.62;
      const grad = ctx.createLinearGradient(
        cue.x - ux * cueStart,
        cue.y - uy * cueStart,
        cue.x - ux * (cueStart + cueLen),
        cue.y - uy * (cueStart + cueLen),
      );
      grad.addColorStop(0, gold.hover);
      grad.addColorStop(0.12, '#caa24a');
      grad.addColorStop(1, '#5a4a24');
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(4, S.r * 0.42);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cue.x - ux * cueStart, cue.y - uy * cueStart);
      ctx.lineTo(cue.x - ux * (cueStart + cueLen), cue.y - uy * (cueStart + cueLen));
      ctx.stroke();
      // Kiy uchi — oq soqqaga qaragan
      ctx.strokeStyle = 'rgba(230,235,232,0.9)';
      ctx.lineWidth = Math.max(4, S.r * 0.42);
      ctx.beginPath();
      ctx.moveTo(cue.x - ux * cueStart, cue.y - uy * cueStart);
      ctx.lineTo(cue.x - ux * (cueStart + S.r * 0.6), cue.y - uy * (cueStart + S.r * 0.6));
      ctx.stroke();
      ctx.restore();
    };

    /** Butun sahnani chizish */
    const draw = () => {
      const { w, h, margin } = S;
      ctx.clearRect(0, 0, w, h);

      // Mato — zumrad radial
      const felt = ctx.createRadialGradient(w * 0.5, h * 0.35, h * 0.1, w * 0.5, h * 0.6, h);
      felt.addColorStop(0, emerald.base);
      felt.addColorStop(0.55, emerald.felt);
      felt.addColorStop(1, emerald.deepest);
      ctx.fillStyle = felt;
      ctx.fillRect(0, 0, w, h);

      // Ichki soya (chuqurlik)
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = margin * 0.9;
      ctx.strokeRect(margin * 0.45, margin * 0.45, w - margin * 0.9, h - margin * 0.9);
      ctx.restore();

      // Markaziy chiziq va nuqta (dekorativ)
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w * 0.28, margin);
      ctx.lineTo(w * 0.28, h - margin);
      ctx.stroke();
      ctx.restore();

      // Teshiklar
      for (const p of S.pockets) {
        const pg = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, S.pocketR);
        pg.addColorStop(0, 'rgba(0,0,0,1)');
        pg.addColorStop(0.7, 'rgba(6,10,8,1)');
        pg.addColorStop(1, 'rgba(20,26,22,0.9)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, S.pocketR * 0.78, 0, Math.PI * 2);
        ctx.fillStyle = pg;
        ctx.fill();
      }

      drawAim();
      for (const b of S.balls) if (b.active) drawBall(b);
    };

    const loop = (ts: number) => {
      if (!S.prev) S.prev = ts;
      let dt = (ts - S.prev) / 16.6667; // ~1 = 60fps birligi
      S.prev = ts;
      if (dt > 3) dt = 3; // tab qayta faollashganda sakrashni cheklash
      if (!S.reduce) step(dt);
      draw();
      S.raf = requestAnimationFrame(loop);
    };

    // ---- Kirish (pointer) hodisalari ----
    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMove = (e: PointerEvent) => {
      const p = toLocal(e);
      S.pointer.x = p.x;
      S.pointer.y = p.y;
      S.pointer.inside = true;
      S.lastInteract = S.prev;
    };
    const onLeave = () => {
      S.pointer.inside = false;
    };
    const onDown = (e: PointerEvent) => {
      const p = toLocal(e);
      S.pointer.x = p.x;
      S.pointer.y = p.y;
      S.pointer.inside = true;
      S.lastInteract = S.prev;
      if (showHint) setShowHint(false);
      const cue = S.balls.find((b) => b.cue && b.active);
      if (!cue || Math.hypot(cue.vx, cue.vy) > 0.08) return;
      const dx = p.x - cue.x;
      const dy = p.y - cue.y;
      // Zarba kuchi mo'ljal masofasiga proporsional (r*0.5 dan r*1.6 gacha, piksel/kadr)
      const drag = Math.hypot(dx, dy);
      const maxPow = S.r * 1.6;
      const power = Math.max(S.r * 0.5, Math.min(maxPow, (drag / (S.w * 0.45)) * maxPow));
      shoot(dx, dy, power);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    // Harakat kamaytirilgan rejimda animatsiya siklini umuman ishga tushirmaymiz
    if (!S.reduce) S.raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(S.raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      S.prev = 0;
    };
    // showHint faqat birinchi zarbada o'zgaradi — sikl qayta o'rnatilishi zarur emas,
    // lekin closure yangi qiymatni ko'rishi uchun bog'liqlikka qo'shamiz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      aria-label="Billiard"
      className={className}
      style={{
        position: 'relative',
        borderRadius: TOKENS.radius.xl + 4,
        padding: 'clamp(10px, 2vw, 16px)',
        background: `linear-gradient(140deg, ${gold.active}, ${gold.dim} 55%, ${gold.active})`,
        border: `1px solid ${gold.line}`,
        boxShadow: '0 40px 90px rgba(0, 0, 0, 0.55)',
        ...style,
      }}
    >
      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          borderRadius: TOKENS.radius.lg,
          aspectRatio: '16 / 10',
          overflow: 'hidden',
          boxShadow: 'inset 0 0 70px rgba(0, 0, 0, 0.55)',
          cursor: 'crosshair',
          touchAction: 'none',
        }}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        {hint && showHint && (
          <span
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 12,
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
    </div>
  );
};

export default BilliardTable;
