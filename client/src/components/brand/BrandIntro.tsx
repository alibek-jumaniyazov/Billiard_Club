import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ASSEMBLED_TIMELINE,
  TIMELINE,
  drawIntroFrame,
  layoutIntro,
  measureWordmark,
  settledAt,
  type IntroScene,
} from '../../brand/logoMotion';
import { FONT_FAMILY, FONT_FAMILY_DISPLAY } from '../../theme/tokens';
import { markIntroPlayed, plannedIntro, releaseIntroHold, type IntroVariant } from './introGate';
import './brand.css';

/** Animatsiya tempi (brend videosidan tezroq — sahifa kutib qolmasin) */
const SPEED: Record<IntroVariant, number> = { full: 1.45, assembled: 1.2 };
/** Sarlavhadagi logotipga uchish va "o'tkazib yuborish"dagi so'nish, soniya */
const FLIGHT = 0.55;
const SKIP_FADE = 0.28;
/** Sahifa hali yuklanayotgan bo'lsa (lazy bo'lim) logotipni shuncha kutamiz */
const MAX_WAIT = 6;
/** Nima bo'lmasin intro shundan keyin yopiladi — sahifani hech qachon to'sib qolmaydi */
const HARD_LIMIT_MS = 12000;
/** Tayyor belgining o'lchami — Android tizim splash ekranidagi belgi bilan bir xil (dp ≈ CSS px) */
const ANDROID_SPLASH_MARK = 192;

interface Target {
  mark: { x: number; y: number; size: number };
  word: { x: number; baseline: number; size: number } | null;
}

/** Sahifadagi ko'rinib turgan brend logotipi (sarlavha, kirish sahifasi yoki menyu) */
const findTarget = (c: CanvasRenderingContext2D): Target | null => {
  const logos = document.querySelectorAll<HTMLElement>('[data-brand-target] [data-brand-logo]');
  for (const logo of Array.from(logos)) {
    const svg = logo.querySelector('svg');
    if (!svg) continue;
    const r = svg.getBoundingClientRect();
    if (r.width < 8 || r.bottom <= 0 || r.right <= 0 || r.top >= window.innerHeight || r.left >= window.innerWidth) {
      continue;
    }
    const wordEl = logo.querySelector<HTMLElement>('[data-brand-word]');
    const wr = wordEl?.getBoundingClientRect();
    let word: Target['word'] = null;
    if (wordEl && wr && wr.width > 0) {
      // line-height:1 — tayanch chiziq qatorning o'rtasidan (A − D)/2 pastda
      const size = parseFloat(getComputedStyle(wordEl).fontSize) || wr.height;
      const shift = measureWordmark(c, size, FONT_FAMILY_DISPLAY).baselineShift;
      word = { x: wr.left, baseline: wr.top + wr.height / 2 + shift, size };
    }
    return { mark: { x: r.left, y: r.top, size: r.width }, word };
  }
  return null;
};

/**
 * BREND INTRO'SI — "B" logotipi yig'iladi va sahifadagi haqiqiy logotip
 * o'rniga uchib tushadi (oxirgi kadr undan farq qilmaydi). Videolar bilan
 * bitta animatsiya: brand/logoMotion.ts.
 *
 * Qachon chiqishini introGate.ts hal qiladi. Har qanday bosish/tugma/aylantirish
 * introni darhol yopadi; sahifa ostida yuklanishda davom etadi.
 */
const BrandIntro = ({ variant, onDone }: { variant: IntroVariant; onDone: () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const root = document.documentElement;
    if (!canvas || !ctx) {
      releaseIntroHold();
      doneRef.current();
      return undefined;
    }
    markIntroPlayed();
    root.classList.add('bc-intro');
    // Bezak hech qachon ishni to'smasin: xato yoki qotib qolishda intro o'zi yopiladi
    const safety = window.setTimeout(() => finish(), HARD_LIMIT_MS);

    const speed = SPEED[variant];
    const timeline = variant === 'assembled' ? ASSEMBLED_TIMELINE : TIMELINE;
    const fonts = { display: FONT_FAMILY_DISPLAY, text: FONT_FAMILY };
    let dpr = 1;
    /** Ekran o'lchamiga mos sahna (canvas o'lchami ham shu yerda yangilanadi) */
    const layout = (): IntroScene => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return {
        ...layoutIntro(ctx, w, h, dpr, fonts, variant === 'assembled' ? { buildSize: ANDROID_SPLASH_MARK } : {}),
        timeline,
      };
    };
    let scene: IntroScene;
    try {
      scene = layout();
    } catch {
      window.clearTimeout(safety);
      root.classList.remove('bc-intro');
      releaseIntroHold();
      doneRef.current();
      return undefined;
    }

    // Yozuv shrifti yuklanmaguncha belgi yozuv tomon siljimaydi (aks holda
    // boshqa shrift bilan o'lchab, keyin "sakrardi")
    let fontsReady = !document.fonts;
    document.fonts
      ?.load(`700 40px ${FONT_FAMILY_DISPLAY}`)
      .catch(() => undefined)
      .then(() => {
        fontsReady = true;
        if (finished || scene.handoff) return;
        try {
          scene = layout();
        } catch {
          finish();
        }
      });

    const settled = settledAt(timeline, scene.reveal);
    let t = 0;
    let last = -1;
    let waited = 0;
    let fadeFrom = -1;
    let raf = 0;
    let finished = false;

    /** Sahifadagi logotipni ko'rsatish (intro paytida yashirin turadi) */
    const reveal = () => root.classList.remove('bc-intro');
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(safety);
      reveal();
      releaseIntroHold();
      doneRef.current();
    };
    /** So'nib yopilish: o'tkazib yuborilganda yoki sahifada logotip topilmasa */
    const fadeOut = () => {
      if (fadeFrom >= 0 || scene.handoff) return;
      fadeFrom = t;
      canvas.classList.add('is-landing');
      reveal();
      releaseIntroHold();
    };

    const frame = (now: number) => {
      try {
        step(now);
      } catch {
        finish();
      }
    };
    const step = (now: number) => {
      const dt = last < 0 ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt * speed;
      if (!fontsReady && t > timeline.lockup[0]) t = timeline.lockup[0];

      // Belgi yig'ildi — endi sahifa ostida chiziladi (qotish harakatsiz kadrga tushadi)
      if (t >= settled) releaseIntroHold();

      if (!scene.handoff && fadeFrom < 0 && t >= settled + 0.1) {
        const target = fontsReady ? findTarget(ctx) : null;
        if (target) {
          scene.handoff = {
            at: t,
            duration: FLIGHT * speed,
            mark: target.mark,
            word: target.word ? { ...target.word, align: 'left', lines: 1 } : null,
          };
          canvas.classList.add('is-landing');
        } else {
          // Bo'lim hali yuklanayotgan bo'lsa kutamiz; sahifada logotip yo'q bo'lsa — so'namiz
          waited += dt;
          const loading = Boolean(document.querySelector('[data-app-loading]'));
          if (!loading || waited > MAX_WAIT) fadeOut();
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawIntroFrame(ctx, scene, t);

      if (scene.handoff && t >= scene.handoff.at + scene.handoff.duration) {
        finish();
        return;
      }
      if (fadeFrom >= 0) {
        const k = (t - fadeFrom) / (SKIP_FADE * speed);
        canvas.style.opacity = String(Math.max(0, 1 - k));
        if (k >= 1) {
          finish();
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Har qanday harakat — intro darhol so'nadi (kassir kutib qolmasin)
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((name) => window.addEventListener(name, fadeOut, { passive: true }));
    // Oyna o'lchami o'zgarsa (Android'da ishga tushishda tez-tez) — qayta joylashib davom etadi
    const onResize = () => {
      if (scene.handoff) finish();
      else {
        try {
          scene = layout();
        } catch {
          finish();
        }
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(safety);
      events.forEach((name) => window.removeEventListener(name, fadeOut));
      window.removeEventListener('resize', onResize);
      reveal();
    };
  }, [variant]);

  return <canvas ref={canvasRef} className="bc-intro-canvas" aria-hidden="true" />;
};

/** Ilova ildizida: intro kerakmi — bir marta hal qiladi, tugagach o'zini olib tashlaydi */
export const BrandIntroHost = () => {
  const [variant, setVariant] = useState(plannedIntro);
  return variant ? <BrandIntro variant={variant} onDone={() => setVariant(null)} /> : null;
};

export default BrandIntro;
