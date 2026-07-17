import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { TOKENS } from '../../theme/tokens';

const { emerald, gold, text } = TOKENS.color;

/**
 * Interaktiv RUS BILYARDI (piramida) stoli — HAQIQIY fizika (canvas 2D).
 *
 * Muhim: teshiklar "magnit" EMAS. Bortlar teshik og'zida uzilgan (bo'shliq
 * qoldirilgan) — shar faqat shu og'izdan kirib, markazga yetsagina tushadi.
 * Bortga tekkanda qaytadi, teshik jag'iga (pocket point) tekkanda esa
 * "rattle" qilib qaytishi ham mumkin — xuddi haqiqiy stoldek.
 *
 * Ko'rinish: to'q yog'och ramka + oltin ip, ko'tarilgan rezina bortlar,
 * charm teshiklar, bort nishonlari (diamonds) va "uy" chizig'i.
 *
 * Fizika: substepli integratsiya (tez shar tunnel qilmaydi), ishqalanish,
 * elastik to'qnashuv, bort/jag' sakrashi. Foydalanuvchi kiy bilan mo'ljal
 * olib bosadi; hech kim tegmasa — o'zi (pool-AI) o'ynaydi.
 * prefers-reduced-motion: statik terilgan piramida.
 */

const IVORY = '#f2ede1';
const CUE_RED = '#cf3a2e';

interface Pocket {
  x: number;
  y: number;
  corner: boolean;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  n: number;
  cue: boolean;
  sink: number;
  sinkTo: Pocket | null;
  active: boolean;
}

interface BilliardTableProps {
  style?: CSSProperties;
  className?: string;
  hint?: string;
}

const BilliardTable = ({ style, className, hint }: BilliardTableProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showHint, setShowHint] = useState(Boolean(hint));

  const stateRef = useRef({
    w: 0,
    h: 0,
    r: 12,
    cushion: 20, // bort qalinligi (chetdan bort tumshug'igacha)
    cm: 22, // burchak teshigi og'zining bort bo'ylab uzunligi
    mm: 18, // o'rta teshik og'zining yarim kengligi
    throat: 20, // teshikka tushish radiusi (markaz shunga yetsa tushadi)
    jaw: 4, // jag' (pocket point) radiusi
    balls: [] as Ball[],
    pockets: [] as Pocket[],
    jaws: [] as { x: number; y: number }[],
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

    const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

    /** Piramidani qayta terish: 15 oq soqqa + qizil biток */
    const rack = () => {
      const { w, h, r } = S;
      const cy = h / 2;
      const apexX = w * 0.6;
      const gapX = r * 1.75;
      const gapY = r * 2.05;
      const balls: Ball[] = [];
      let n = 1;
      for (let col = 0; col < 5; col++) {
        const count = col + 1;
        const x = apexX + col * gapX;
        for (let i = 0; i < count; i++) {
          const y = cy + (i - (count - 1) / 2) * gapY;
          balls.push({
            x,
            y,
            vx: 0,
            vy: 0,
            color: IVORY,
            n: n++,
            cue: false,
            sink: 1,
            sinkTo: null,
            active: true,
          });
        }
      }
      balls.push({
        x: w * 0.24,
        y: cy,
        vx: 0,
        vy: 0,
        color: CUE_RED,
        n: 0,
        cue: true,
        sink: 1,
        sinkTo: null,
        active: true,
      });
      S.balls = balls;
    };

    /** O'lchamni (DPR bilan) moslash va stol geometriyasini hisoblash */
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

      const r = Math.max(7, Math.min(w, h) * 0.033);
      S.r = r;
      S.cushion = Math.min(w, h) * 0.05;
      // Kengroq, kechirimliroq teshiklar (magnitsiz, lekin osonroq tushadi):
      // keng og'iz + kattaroq tushish zonasi + kichikroq jag' (kam "rattle")
      S.cm = r * 2.3; // burchak teshigi og'zi
      S.mm = r * 2.0; // o'rta teshik og'zi
      S.throat = r * 2.05; // markaz shunga yetsa tushadi (samarali teshik o'lchami)
      S.jaw = r * 0.22;

      const c = S.cushion;
      // Teshik markazlari — bort tumshug'idan sal tashqarida (charm ichida)
      S.pockets = [
        { x: c * 0.5, y: c * 0.5, corner: true },
        { x: w - c * 0.5, y: c * 0.5, corner: true },
        { x: c * 0.5, y: h - c * 0.5, corner: true },
        { x: w - c * 0.5, y: h - c * 0.5, corner: true },
        { x: w / 2, y: c * 0.4, corner: false },
        { x: w / 2, y: h - c * 0.4, corner: false },
      ];
      // Jag' (pocket point) nuqtalari — bort segmentlarining teshik yonidagi uchlari
      const cm = S.cm;
      const mm = S.mm;
      S.jaws = [
        // Yuqori bort uchlari
        { x: c + cm, y: c },
        { x: w / 2 - mm, y: c },
        { x: w / 2 + mm, y: c },
        { x: w - c - cm, y: c },
        // Pastki bort uchlari
        { x: c + cm, y: h - c },
        { x: w / 2 - mm, y: h - c },
        { x: w / 2 + mm, y: h - c },
        { x: w - c - cm, y: h - c },
        // Chap bort uchlari
        { x: c, y: c + cm },
        { x: c, y: h - c - cm },
        // O'ng bort uchlari
        { x: w - c, y: c + cm },
        { x: w - c, y: h - c - cm },
      ];

      if (S.balls.length === 0) rack();
      else {
        S.balls.forEach((b) => {
          b.x = Math.min(Math.max(b.x, c + r + 1), w - c - r - 1);
          b.y = Math.min(Math.max(b.y, c + r + 1), h - c - r - 1);
        });
      }
      if (S.reduce) draw();
    };

    /** Oq soqqani (biток) berilgan yo'nalishda urish */
    const shoot = (dirX: number, dirY: number, power: number) => {
      const cue = S.balls.find((b) => b.cue && b.active);
      if (!cue) return;
      const len = Math.hypot(dirX, dirY) || 1;
      cue.vx = (dirX / len) * power;
      cue.vy = (dirY / len) * power;
      S.lastShotAt = S.prev;
    };

    /** Nuqtadan kesmagacha masofa (yo'l tozaligini tekshirish uchun) */
    const segDist = (
      px: number,
      py: number,
      ax: number,
      ay: number,
      bx: number,
      by: number,
    ) => {
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy || 1;
      let t = ((px - ax) * dx + (py - ay) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    };

    const clearPath = (ax: number, ay: number, bx: number, by: number, ignore: Ball) => {
      for (const b of S.balls) {
        if (!b.active || b.sink < 1 || b.cue || b === ignore) continue;
        if (segDist(b.x, b.y, ax, ay, bx, by) < S.r * 1.75) return false;
      }
      return true;
    };

    /**
     * Namoyish zarbasi (pool-AI): BITOK→ghost va NISHON→teshik yo'llari toza
     * bo'lgan eng qulay potni tanlaydi. Toza pot yo'q bo'lsa — pakni yoradi.
     * Magnit yo'q: mo'ljal aniq bo'lsa shar og'izga kirib tushadi, aks holda
     * bort/jag'ga urilib qaytadi (rattle) — realistik.
     */
    const autoShoot = () => {
      const cue = S.balls.find((b) => b.cue && b.active);
      const targets = S.balls.filter((b) => !b.cue && b.active);
      if (!cue || targets.length === 0) return;

      let bestGhost: { x: number; y: number } | null = null;
      let bestDims: { cg: number; tp: number } | null = null;
      let bestScore = Infinity;
      for (const t of targets) {
        for (const p of S.pockets) {
          const tp = dist(t.x, t.y, p.x, p.y) || 1;
          const gx = t.x - ((p.x - t.x) / tp) * S.r * 2;
          const gy = t.y - ((p.y - t.y) / tp) * S.r * 2;
          const cg = dist(cue.x, cue.y, gx, gy) || 1;
          const dot =
            ((gx - cue.x) / cg) * ((p.x - t.x) / tp) + ((gy - cue.y) / cg) * ((p.y - t.y) / tp);
          if (dot < 0.38) continue; // yetarlicha burchakli potlar (kechirimliroq)
          if (!clearPath(cue.x, cue.y, gx, gy, t)) continue;
          if (!clearPath(t.x, t.y, p.x, p.y, t)) continue;
          const score = tp + cg * 0.5 + (1 - dot) * 220;
          if (score < bestScore) {
            bestScore = score;
            bestGhost = { x: gx, y: gy };
            bestDims = { cg, tp };
          }
        }
      }

      if (bestGhost && bestDims) {
        const power = Math.max(
          S.r * 1.6,
          Math.min(S.r * 3.0, (bestDims.cg + bestDims.tp * 1.5) * 0.06 + S.r * 1.0),
        );
        shoot(bestGhost.x - cue.x, bestGhost.y - cue.y, power);
      } else {
        let t = targets[0];
        let bd = Infinity;
        for (const c of targets) {
          const d = dist(cue.x, cue.y, c.x, c.y);
          if (d < bd) {
            bd = d;
            t = c;
          }
        }
        shoot(t.x - cue.x, t.y - cue.y, S.r * 2.6);
      }
    };

    const allResting = () => S.balls.every((b) => !b.active || Math.hypot(b.vx, b.vy) < 0.05);

    /** Bitta kichik fizika qadami (substep) */
    const integrate = (dt: number) => {
      const { r, w, h, cushion, cm, mm } = S;
      const friction = Math.pow(0.985, dt);
      const rest = 0.82; // bort qaytarish koeffitsiyenti

      for (const b of S.balls) {
        if (!b.active) continue;

        // Teshikka tushish animatsiyasi
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

        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vx *= friction;
        b.vy *= friction;
        if (Math.hypot(b.vx, b.vy) < 0.03) {
          b.vx = 0;
          b.vy = 0;
        }

        // 1) Teshikka tushish — markaz throat ga yetganda (MAGNITSIZ)
        let dropped = false;
        for (const p of S.pockets) {
          if (dist(b.x, b.y, p.x, p.y) < S.throat) {
            b.sinkTo = p;
            b.sink = 0.999;
            b.vx *= 0.35;
            b.vy *= 0.35;
            dropped = true;
            break;
          }
        }
        if (dropped) continue;

        // 2) Jag' (pocket point) sakrashi — rattle
        for (const j of S.jaws) {
          const d = dist(b.x, b.y, j.x, j.y);
          const min = r + S.jaw;
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

        // 3) Bort (cushion) sakrashi — faqat segment ichida (og'iz bo'shlig'idan tashqarida)
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

        // 4) Zaxira: kanvasdan chiqib ketsa — eng yaqin teshikka tushiriladi
        if (b.x < -r || b.x > w + r || b.y < -r || b.y > h + r) {
          let np = S.pockets[0];
          let nd = Infinity;
          for (const p of S.pockets) {
            const d = dist(b.x, b.y, p.x, p.y);
            if (d < nd) {
              nd = d;
              np = p;
            }
          }
          b.sinkTo = np;
          b.sink = 0.999;
        }
      }

      // Soqqa-soqqa to'qnashuvi — impuls asosidagi PROFESSIONAL javob:
      //  • restitutsiya REST≈0.95 (haqiqiy bilyard shari; teng massada bosh
      //    zarbadan keyin zarb sharida nozik "follow" qoladi);
      //  • impuls FAQAT soqqalar yaqinlashayotgan bo'lsa qo'llanadi — ajralgan
      //    (yoki tinch, yopishib turgan) soqqalarga energiya qo'shilmaydi, shu
      //    bois zich piramida titramaydi/portlamaydi;
      //  • urinma (tangensial) ishqalanish — kesik (glancing) zarbada tabiiy
      //    "throw" beradi;
      //  • bir necha iteratsiya — zich pak barqaror ajraladi (impuls guard
      //    tufayli qayta qo'llanmaydi).
      const REST = 0.95;
      const CFRICTION = 0.02;
      const min = r * 2;
      const live = S.balls.filter((b) => b.active && b.sink >= 1);
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
            // 1) Pozitsion ajratish (o'zaro kirishishni tuzatadi)
            const overlap = (min - d) / 2;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            c.x += nx * overlap;
            c.y += ny * overlap;
            // 2) Normal bo'ylab nisbiy tezlik — yaqinlashmasa impuls yo'q
            const rvx = a.vx - c.vx;
            const rvy = a.vy - c.vy;
            const vn = rvx * nx + rvy * ny;
            if (vn <= 0) continue;
            const jn = ((1 + REST) * vn) / 2; // teng massa uchun impuls
            a.vx -= jn * nx;
            a.vy -= jn * ny;
            c.vx += jn * nx;
            c.vy += jn * ny;
            // 3) Urinma ishqalanish (nozik "throw")
            const tx = -ny;
            const ty = nx;
            const vt = rvx * tx + rvy * ty;
            const jt = vt * CFRICTION;
            a.vx -= jt * tx;
            a.vy -= jt * ty;
            c.vx += jt * tx;
            c.vy += jt * ty;
          }
        }
      }
    };

    /** Kadr qadami — substeplar + namoyish sikli */
    const step = (dt: number) => {
      let maxV = 0;
      for (const b of S.balls) {
        if (b.active && b.sink >= 1) maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
      }
      const sub = Math.min(12, Math.max(1, Math.ceil((maxV * dt) / (S.r * 0.3))));
      const sdt = dt / sub;
      for (let s = 0; s < sub; s++) integrate(sdt);

      const idle = S.prev - S.lastInteract > 2200;
      if (allResting()) {
        const cueActive = S.balls.some((b) => b.cue && b.active);
        const targets = S.balls.filter((b) => !b.cue && b.active).length;
        if ((!cueActive || targets <= 1) && S.prev - S.lastShotAt > 700) {
          rack();
        } else if (idle && !S.reduce && S.prev - S.lastShotAt > 900) {
          autoShoot();
        }
      }
    };

    /* -------------------------------------------------------------- Chizish */

    const drawBall = (b: Ball) => {
      const rr = S.r * b.sink;
      if (rr <= 0.5) return;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + rr * 0.55, rr * 0.92, rr * 0.46, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fill();
      const g = ctx.createRadialGradient(
        b.x - rr * 0.34,
        b.y - rr * 0.4,
        rr * 0.12,
        b.x,
        b.y,
        rr,
      );
      g.addColorStop(0, b.cue ? '#ffd9d0' : '#ffffff');
      g.addColorStop(0.5, b.color);
      g.addColorStop(1, b.cue ? '#7a1e16' : '#b7b0a0');
      ctx.beginPath();
      ctx.arc(b.x, b.y, rr, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      if (b.n > 0 && b.sink > 0.7) {
        ctx.fillStyle = 'rgba(38,32,24,0.9)';
        ctx.font = `700 ${rr * 0.74}px 'Inter Variable', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(b.n), b.x, b.y + rr * 0.04);
      }
      ctx.beginPath();
      ctx.arc(b.x - rr * 0.33, b.y - rr * 0.37, rr * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();
    };

    const drawAim = () => {
      if (!S.pointer.inside || S.reduce) return;
      const cue = S.balls.find((b) => b.cue && b.active);
      if (!cue || Math.hypot(cue.vx, cue.vy) > 0.08) return;
      const dx = S.pointer.x - cue.x;
      const dy = S.pointer.y - cue.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;

      ctx.save();
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cue.x + ux * S.r, cue.y + uy * S.r);
      ctx.lineTo(cue.x + ux * Math.min(len, S.w), cue.y + uy * Math.min(len, S.w));
      ctx.stroke();
      ctx.setLineDash([]);

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
      grad.addColorStop(0, '#e8c069');
      grad.addColorStop(0.12, '#caa24a');
      grad.addColorStop(1, '#5a4a24');
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(4, S.r * 0.42);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cue.x - ux * cueStart, cue.y - uy * cueStart);
      ctx.lineTo(cue.x - ux * (cueStart + cueLen), cue.y - uy * (cueStart + cueLen));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(230,235,232,0.9)';
      ctx.lineWidth = Math.max(4, S.r * 0.42);
      ctx.beginPath();
      ctx.moveTo(cue.x - ux * cueStart, cue.y - uy * cueStart);
      ctx.lineTo(cue.x - ux * (cueStart + S.r * 0.6), cue.y - uy * (cueStart + S.r * 0.6));
      ctx.stroke();
      ctx.restore();
    };

    /** Bir bort segmenti (ko'tarilgan rezina bort) */
    const drawCushion = (x: number, y: number, cw: number, ch: number, side: 'h' | 'v') => {
      const grad =
        side === 'h'
          ? ctx.createLinearGradient(0, y, 0, y + ch)
          : ctx.createLinearGradient(x, 0, x + cw, 0);
      // Tumshoq (nose) yorug'roq, tag qismi to'qroq — hajm hissi
      grad.addColorStop(0, '#1c5636');
      grad.addColorStop(0.5, '#17492d');
      grad.addColorStop(1, '#0f3420');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, cw, ch);
    };

    const draw = () => {
      const { w, h, cushion: c, cm, mm } = S;
      ctx.clearRect(0, 0, w, h);

      // Mato (cloth) — zumrad, markazda yorug', chetlarda vignetka
      const felt = ctx.createRadialGradient(w * 0.5, h * 0.42, h * 0.12, w * 0.5, h * 0.5, w * 0.75);
      felt.addColorStop(0, '#2a7d4f');
      felt.addColorStop(0.6, emerald.felt);
      felt.addColorStop(1, '#0e2c1c');
      ctx.fillStyle = felt;
      ctx.fillRect(0, 0, w, h);

      // Ko'tarilgan rezina bortlar (teshik og'izlarida uzilgan)
      // Yuqori/pastki (uzun) bortlar — 2 tadan segment
      drawCushion(c + cm, 0, w / 2 - mm - (c + cm), c, 'h');
      drawCushion(w / 2 + mm, 0, w - c - cm - (w / 2 + mm), c, 'h');
      drawCushion(c + cm, h - c, w / 2 - mm - (c + cm), c, 'h');
      drawCushion(w / 2 + mm, h - c, w - c - cm - (w / 2 + mm), c, 'h');
      // Chap/o'ng (kalta) bortlar
      drawCushion(0, c + cm, c, h - 2 * (c + cm), 'v');
      drawCushion(w - c, c + cm, c, h - 2 * (c + cm), 'v');

      // Bort tumshug'idagi nozik yorug'lik chizig'i (nose highlight)
      ctx.strokeStyle = 'rgba(120,200,150,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // yuqori
      ctx.moveTo(c + cm, c);
      ctx.lineTo(w / 2 - mm, c);
      ctx.moveTo(w / 2 + mm, c);
      ctx.lineTo(w - c - cm, c);
      // pastki
      ctx.moveTo(c + cm, h - c);
      ctx.lineTo(w / 2 - mm, h - c);
      ctx.moveTo(w / 2 + mm, h - c);
      ctx.lineTo(w - c - cm, h - c);
      // chap/o'ng
      ctx.moveTo(c, c + cm);
      ctx.lineTo(c, h - c - cm);
      ctx.moveTo(w - c, c + cm);
      ctx.lineTo(w - c, h - c - cm);
      ctx.stroke();

      // "Uy" chizig'i
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w * 0.28, c);
      ctx.lineTo(w * 0.28, h - c);
      ctx.stroke();

      // Charm teshiklar
      for (const p of S.pockets) {
        const R = S.throat * 1.15;
        // charm halqa
        ctx.beginPath();
        ctx.arc(p.x, p.y, R * 1.15, 0, Math.PI * 2);
        ctx.fillStyle = '#241a12';
        ctx.fill();
        // tuynuk
        const pg = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, R);
        pg.addColorStop(0, '#000');
        pg.addColorStop(0.7, '#050605');
        pg.addColorStop(1, '#181410');
        ctx.beginPath();
        ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
        ctx.fillStyle = pg;
        ctx.fill();
      }

      // Bort nishonlari (diamonds) — bort ustida
      ctx.fillStyle = 'rgba(240,236,225,0.5)';
      const diamond = (x: number, y: number) => {
        const s = Math.max(1.6, S.r * 0.16);
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

      drawAim();
      for (const b of S.balls) if (b.active) drawBall(b);
    };

    const loop = (ts: number) => {
      if (!S.prev) S.prev = ts;
      let dt = (ts - S.prev) / 16.6667;
      S.prev = ts;
      if (dt > 3) dt = 3;
      step(dt);
      draw();
      S.raf = requestAnimationFrame(loop);
    };

    // ---- Pointer ----
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
      if (S.reduce) return;
      const cue = S.balls.find((b) => b.cue && b.active);
      if (!cue || Math.hypot(cue.vx, cue.vy) > 0.08) return;
      const dx = p.x - cue.x;
      const dy = p.y - cue.y;
      const drag = Math.hypot(dx, dy);
      const maxPow = S.r * 1.9;
      const power = Math.max(S.r * 0.5, Math.min(maxPow, (drag / (S.w * 0.45)) * maxPow));
      shoot(dx, dy, power);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    if (!S.reduce) S.raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(S.raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      S.prev = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      aria-label="Rus bilyardi"
      className={className}
      style={{
        position: 'relative',
        borderRadius: TOKENS.radius.xl + 6,
        // Sayqallangan to'q yong'oq yog'och ramka + nozik oltin ip
        padding: 'clamp(12px, 2.4vw, 20px)',
        background:
          'linear-gradient(145deg, #4a331f 0%, #3a2617 8%, #241811 50%, #3a2617 92%, #4a331f 100%)',
        border: `1px solid ${gold.line}`,
        boxShadow: `0 40px 90px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(212,175,55,0.18)`,
        ...style,
      }}
    >
      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          borderRadius: TOKENS.radius.md,
          aspectRatio: '16 / 10',
          overflow: 'hidden',
          boxShadow:
            'inset 0 0 0 2px rgba(0,0,0,0.5), inset 0 0 60px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4)',
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
