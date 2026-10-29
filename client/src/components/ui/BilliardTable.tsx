import { useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { CloseOutlined, MutedOutlined, ReloadOutlined, SoundOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { TOKENS } from '../../theme/tokens';
import { planShot, type Shot } from './billiard/ai';
import {
  SPIN_MAX,
  aimGap,
  chargePower,
  clampSpinPoint,
  powerToSpeed,
  shakeAmplitude,
  shakeOffset,
  spinFromPoint,
  strikeDuration,
} from './billiard/controls';
import {
  PHYS,
  R,
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
import {
  FLASH_MS,
  POP_MS,
  buildTableLayer,
  computeView,
  drawScene,
  toWorld,
  type CuePose,
  type EffectsDraw,
  type GuideDraw,
  type PowerDraw,
} from './billiard/render';
import { createBilliardSound, type BilliardSound } from './billiard/sound';
import './billiard/billiard.css';

/**
 * Interaktiv RUS BILYARDI (piramida) stoli — haqiqiy fizika, protsedural grafika.
 *
 * Fizika (billiard/physics.ts): belgilangan qadam (240 Hz), sirpanish → dumalash,
 * vint, tezlikka bog'liq bortlar, magnitsiz teshiklar. Grafika (billiard/render.ts):
 * yog'och bort, donador mato, lampa yorug'i, hajmli sharlar va aylanadigan raqamlar.
 *
 * O'yin: mo'ljal — ko'rsatkich tomon; BOSIB TURILSA kuch yig'iladi (kiy orqaga
 * tortiladi, halqa zumrad → oltin → qizil), qo'yib yuborilganda kiy uradi.
 * Stoldan tashqarida qo'yib yuborish, Esc yoki o'ng tugma — zarbani bekor qiladi.
 * Vint vidjeti (pastki bortda) — kiy uchi nuqtasi: nakat, ottyajka, yon vint.
 * Ovozlar WebAudio bilan sintez qilinadi va faqat tashrif buyuruvchi stolga
 * tekkandan keyin yoqiladi. Hech kim tegmasa stol o'zi o'ynaydi; ekrandan
 * chiqsa yoki tab yashirilsa — sikl to'xtaydi. prefers-reduced-motion: statik
 * terilgan piramida, boshqaruvlarsiz.
 */

/**
 * O'yin hodisalari — sahifa tashrif buyuruvchi o'yinini mahsulot hikoyasiga
 * bog'lashi uchun (masalan "+1" — kassada yozildi). Fizika qadamidan TASHQARIDA,
 * har kadrda bir marta yuboriladi: sekin ishlovchi simulyatsiyani to'xtatmaydi.
 * Harakat kamaytirilgan (statik) rejimda hech qachon yuborilmaydi.
 */
export type BilliardGameEvent =
  /** Kiy sharga haqiqatan tekkan payt; `power` 0..1 */
  | { type: 'shot'; by: 'user' | 'ai'; power: number }
  /** Soqqa tushdi; `by` — o'sha zarbani kim urgan; `remaining` — stolda qolgan soqqalar */
  | { type: 'pocket'; by: 'user' | 'ai'; ball: number; remaining: number }
  /** Biток teshikka tushdi */
  | { type: 'scratch'; by: 'user' | 'ai' }
  /** Piramida qayta terildi: soqqalar tugadi yoki "qayta terish" tugmasi */
  | { type: 'rack'; reason: 'cleared' | 'button' };

interface BilliardTableProps {
  style?: CSSProperties;
  className?: string;
  /** Maqsad matni (masalan "Soqqani teshikka urib tushiring"); berilmasa — billiard.goal */
  hint?: string;
  /** Ekran o'quvchi uchun stol nomi; berilmasa — billiard.aria */
  ariaLabel?: string;
  /** O'yin hodisalari (yuqoriga qarang) — ref'da saqlanadi, siklni qayta ishga tushirmaydi */
  onGameEvent?: (event: BilliardGameEvent) => void;
}

/** Namoyish kiyi vaqtlari, ms */
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
/**
 * Telefonda shuncha bosib turilgach sahifa aylanmaydi — barmoq bilan bemalol
 * mo'ljal olinadi. Undan oldin tez surish — oddiy sahifa aylantirish (stol
 * "tuzoq" bo'lmasin): brauzer pointercancel yuboradi va zarba bekor bo'ladi.
 */
const TOUCH_LOCK_MS = 140;
/** Namoyish zarbalari tashrif buyuruvchinikidan sokinroq */
const AI_VOLUME = 0.55;
const TOAST_MS = 1700;
const DOUBLE_TAP_MS = 320;
const MUTE_KEY = 'billiard.muted';

const TABLE = createTable();
const ASPECT = `${TABLE.outerW} / ${TABLE.outerH}`;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const readMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
};

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
  /** Barmoq bilan urildi — tebranish (vibrate) beriladi */
  touch: boolean;
}

interface TableApi {
  rerack: () => void;
  /** Vint tanlagich ochiq — namoyish o'yini kutib turadi */
  hold: (on: boolean) => void;
}

const BilliardTable = ({ style, className, hint, ariaLabel, onGameEvent }: BilliardTableProps) => {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spinBtnRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [reduced] = useState(prefersReducedMotion);
  const [showHint, setShowHint] = useState(() => !prefersReducedMotion());
  const [muted, setMuted] = useState(readMuted);
  const [spin, setSpin] = useState({ x: 0, y: 0 });
  const [spinOpen, setSpinOpen] = useState(false);
  const [stats, setStats] = useState({ shots: 0, pocketed: 0 });
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  // Sikl React'dan tashqarida — eng so'nggi qiymatlarni ref orqali o'qiydi
  const spinRef = useRef(spin);
  spinRef.current = spin;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const tRef = useRef(t);
  tRef.current = t;
  const onGameEventRef = useRef(onGameEvent);
  onGameEventRef.current = onGameEvent;
  const soundRef = useRef<BilliardSound | null>(null);
  const apiRef = useRef<TableApi | null>(null);
  const lastTapRef = useRef(0);
  const tapStartRef = useRef({ x: 0, y: 0 });
  /** Vint tanlagichda surilayotgan ko'rsatkich (yo'q bo'lsa null) */
  const dragRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = prefersReducedMotion();
    const rng = createRng((Date.now() ^ 0x5bd1e995) >>> 0);
    const world = createWorld(rng);
    const events: NonNullable<typeof world.events> = [];
    world.events = events;
    const sound = createBilliardSound();
    sound.setMuted(mutedRef.current);
    soundRef.current = sound;

    const S = {
      view: computeView(world.table, 1, 1, 1),
      layer: null as HTMLCanvasElement | null,
      phase: 'idle' as 'idle' | 'aiming' | 'striking' | 'moving',
      pointer: { x: 0, y: 0, inside: false, pressed: false },
      aim: { dirX: 1, dirY: 0, valid: false },
      charge: null as { start: number; pointerId: number; touch: boolean } | null,
      lastInteract: -Infinity,
      settledAt: 0,
      pending: null as Pending | null,
      lastBy: 'ai' as 'user' | 'ai',
      after: null as { x: number; y: number; dirX: number; dirY: number; at: number; power: number } | null,
      hold: false,
      flashes: [] as EffectsDraw['flashes'],
      pops: [] as EffectsDraw['pops'],
      shake: null as { at: number; amp: number } | null,
      /** Sahifaga yuboriladigan o'yin hodisalari — kadr oxirida bo'shatiladi */
      outbox: [] as BilliardGameEvent[],
      cursor: '',
      acc: 0,
      prev: 0,
      raf: 0,
      inView: true,
      pageVisible: !document.hidden,
    };

    const showToast = (text: string) => setToast({ id: performance.now(), text });

    /** O'yin hodisasi navbatga — statik rejimda hech narsa yuborilmaydi */
    const emitGame = (event: BilliardGameEvent) => {
      if (!reduce) S.outbox.push(event);
    };
    /** Navbatni sahifaga uzatish (fizika qadamidan tashqarida, kadr oxirida) */
    const flushGame = () => {
      if (S.outbox.length === 0) return;
      const batch = S.outbox;
      S.outbox = [];
      const handler = onGameEventRef.current;
      if (!handler) return;
      for (const event of batch) {
        try {
          handler(event);
        } catch (err) {
          // Sahifa ishlovchisidagi xato o'yinni to'xtatmasin
          console.error(err);
        }
      }
    };

    /* ------------------------------------------------------------ Zarba */

    const beginStrike = (
      shot: Pick<Shot, 'dirX' | 'dirY' | 'speed' | 'side' | 'vertical'>,
      by: 'user' | 'ai',
      now: number,
      power: number,
      touch = false,
    ) => {
      const cue = cueBall(world);
      if (!cue) return;
      const len = Math.hypot(shot.dirX, shot.dirY) || 1;
      const total =
        by === 'user' ? strikeDuration(power) : AI_FADE_MS + AI_PRACTICE_MS + AI_BACKSWING_MS + AI_STRIKE_MS;
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
        touch,
      };
      S.after = null;
      S.phase = 'striking';
    };

    const canAim = () => {
      // Namoyish zarbasi hali urilmagan bo'lsa — foydalanuvchi darhol o'z qo'liga oladi
      if (S.pending?.by === 'ai') {
        S.pending = null;
        S.phase = 'idle';
      }
      return S.phase !== 'striking' && S.phase !== 'moving' && !!cueBall(world) && isSettled(world);
    };

    /** Mo'ljal — biтокdan ko'rsatkich tomon; shar ustida bosilsa oldingi yo'nalish qoladi */
    const updateAim = () => {
      const cue = cueBall(world);
      if (!cue) return;
      const dx = S.pointer.x - cue.x;
      const dy = S.pointer.y - cue.y;
      const d = Math.hypot(dx, dy);
      if (d > 1.15 * R) {
        S.aim = { dirX: dx / d, dirY: dy / d, valid: true };
        return;
      }
      if (S.aim.valid) return;
      // Birinchi bosish to'g'ridan-to'g'ri shar ustida — eng yaqin soqqaga qaratamiz
      const target = liveObjectBalls(world).reduce<{ x: number; y: number } | null>(
        (best, b) => (!best || Math.hypot(b.x - cue.x, b.y - cue.y) < Math.hypot(best.x - cue.x, best.y - cue.y) ? b : best),
        null,
      );
      if (target) {
        const tl = Math.hypot(target.x - cue.x, target.y - cue.y) || 1;
        S.aim = { dirX: (target.x - cue.x) / tl, dirY: (target.y - cue.y) / tl, valid: true };
      }
    };

    const cancelCharge = () => {
      if (!S.charge) return;
      S.charge = null;
      if (S.phase === 'aiming' && !S.pointer.inside) S.phase = 'idle';
    };

    const spinNow = () => spinFromPoint(spinRef.current.x, spinRef.current.y);

    /* ----------------------------------------------------------- Holat */

    /** Fizika hodisalari → ovoz va "+1" effektlari */
    const drainEvents = (now: number) => {
      if (events.length === 0) return;
      const gain = S.lastBy === 'user' ? 1 : AI_VOLUME;
      const { L, B, pockets } = world.table;
      // Bir kadrda bir nechta soqqa tushsa — har biri uchun o'zidan keyin qolgan son
      let laterPots = events.filter((ev) => ev.kind === 'pocket' && ev.id !== 0).length;
      const liveNow = liveObjectBalls(world).length;
      for (const ev of events) {
        if (ev.kind === 'ball') sound.click(ev.speed, gain);
        else if (ev.kind === 'cushion') sound.cushion(ev.speed, gain);
        else {
          sound.pocket(gain);
          if (ev.id === 0) emitGame({ type: 'scratch', by: S.lastBy });
          else {
            laterPots -= 1;
            emitGame({ type: 'pocket', by: S.lastBy, ball: ev.id, remaining: liveNow + laterPots });
          }
          if (S.lastBy === 'user' && ev.id !== 0) {
            const p = pockets[ev.pocket];
            const tx = L / 2 - p.x;
            const ty = B / 2 - p.y;
            const tl = Math.hypot(tx, ty) || 1;
            S.pops.push({ x: p.x, y: p.y, dx: tx / tl, dy: ty / tl, at: now, text: tRef.current('billiard.potted', { n: 1 }) });
          }
        }
      }
      events.length = 0;
    };

    const update = (now: number, dt: number) => {
      if (S.pending && now >= S.pending.hitAt) {
        const p = S.pending;
        strike(world, p.dirX, p.dirY, p.speed, p.side, p.vertical);
        S.after = { x: p.x, y: p.y, dirX: p.dirX, dirY: p.dirY, at: now, power: p.power };
        S.lastBy = p.by;
        S.pending = null;
        S.phase = 'moving';
        S.flashes.push({ x: p.x - p.dirX * R, y: p.y - p.dirY * R, at: now, power: p.power });
        sound.cue(p.by === 'user' ? p.power : p.power * AI_VOLUME);
        emitGame({ type: 'shot', by: p.by, power: p.power });
        if (p.by === 'user') {
          setStats((s) => ({ ...s, shots: s.shots + 1 }));
          const amp = shakeAmplitude(p.power);
          if (amp > 0) S.shake = { at: now, amp };
          if (p.touch && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(p.power > 0.85 ? 24 : 12);
          }
        }
      }

      S.acc = Math.min(S.acc + dt, 0.25);
      while (S.acc >= PHYS.dt) {
        step(world);
        S.acc -= PHYS.dt;
      }
      drainEvents(now);

      if (S.phase === 'moving' && isSettled(world)) {
        S.phase = 'idle';
        S.settledAt = now;
        const potted = world.pocketed.filter((id) => id !== 0).length;
        const scratch = world.pocketed.includes(0);
        let message: string | null = null;
        if (S.lastBy === 'user') {
          if (potted > 0) setStats((s) => ({ ...s, pocketed: s.pocketed + potted }));
          if (scratch) message = tRef.current('billiard.scratch');
          else if (potted >= 2) message = tRef.current('billiard.great', { n: potted });
        }
        if (liveObjectBalls(world).length <= 1) {
          rackBalls(world, rng);
          emitGame({ type: 'rack', reason: 'cleared' });
          if (S.lastBy === 'user') message ??= tRef.current('billiard.newRack');
        } else if (!cueBall(world)) respawnCue(world);
        if (message) showToast(message);
      }

      if (
        S.phase === 'idle' &&
        !S.pointer.pressed &&
        !S.hold &&
        now - S.lastInteract > (S.lastBy === 'user' ? IDLE_AFTER_USER_MS : IDLE_BEFORE_AI_MS) &&
        now - S.settledAt > 700
      ) {
        const shot = planShot(world, rng);
        if (shot) beginStrike(shot, 'ai', now, clamp01(shot.speed / PHYS.maxSpeed));
      }
    };

    /** Kiyning joriy holati — mo'ljal/kuch yig'ish, amaliy siltashlar, zarba va yo'qolish */
    const cuePose = (now: number): CuePose | null => {
      const p = S.pending;
      if (p) {
        const t = now - p.start;
        const base = { x: p.x, y: p.y, dirX: p.dirX, dirY: p.dirY };
        if (p.by === 'user') {
          const k = clamp01(t / Math.max(1, p.hitAt - p.start));
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
            // Kuchli zarbada kiy shar o'rnidan uzoqroq "o'tib" ketadi
            gap: -(0.6 + 0.8 * S.after.power) * clamp01(t / FOLLOW_MS),
            alpha: t < FOLLOW_MS ? 1 : 1 - (t - FOLLOW_MS) / FADE_MS,
          };
        }
        S.after = null;
      }
      if (S.phase === 'aiming' && S.aim.valid && (S.pointer.inside || S.charge)) {
        const cue = cueBall(world);
        if (!cue) return null;
        if (!S.charge) return { x: cue.x, y: cue.y, dirX: S.aim.dirX, dirY: S.aim.dirY, gap: 0.8, alpha: 1 };
        const power = chargePower(now - S.charge.start);
        // 100% da kiy sekin "nafas oladi" — o'yinchi kuch to'lganini his qiladi
        const breathe = power >= 0.999 ? 0.14 * Math.sin((now / 1000) * Math.PI * 2 * 2.2) : 0;
        return {
          x: cue.x,
          y: cue.y,
          dirX: S.aim.dirX,
          dirY: S.aim.dirY,
          gap: aimGap(power) + breathe,
          alpha: S.pointer.inside ? 1 : 0.45,
        };
      }
      return null;
    };

    const draw = (now: number) => {
      if (!S.layer) return;
      const cue = cueBall(world);
      let guide: GuideDraw | null = null;
      let power: PowerDraw | null = null;
      if (cue && S.phase === 'aiming' && S.aim.valid && (S.pointer.inside || S.charge)) {
        const value = S.charge ? chargePower(now - S.charge.start) : 0.35;
        const armed = !S.charge || S.pointer.inside;
        const info = castAim(world, S.aim.dirX, S.aim.dirY);
        if (info) guide = { aim: info, alpha: armed ? 1 : 0.35, power: value, vertical: spinNow().vertical };
        if (S.charge) {
          power = {
            x: cue.x,
            y: cue.y,
            dirX: S.aim.dirX,
            dirY: S.aim.dirY,
            value,
            pulse: value >= 0.999 ? 0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 2 * 2.2) : 0,
            armed,
          };
        }
      } else if (cue && S.pending?.by === 'ai') {
        // Namoyishda ham mo'ljal chizig'i — tomoshabin zarbani oldindan ko'radi
        const info = castAim(world, S.pending.dirX, S.pending.dirY);
        const t = now - S.pending.start;
        if (info) {
          guide = {
            aim: info,
            alpha: 0.55 * clamp01(t / AI_FADE_MS) * clamp01((S.pending.hitAt - now) / 120),
            power: S.pending.power,
            vertical: S.pending.vertical,
          };
        }
      }
      const effects = S.flashes.length || S.pops.length ? { now, flashes: S.flashes, pops: S.pops } : null;
      drawScene(ctx, S.layer, world, S.view, {
        guide,
        cue: cuePose(now),
        cueX: cue?.x ?? 0,
        cueY: cue?.y ?? 0,
        power,
        effects,
      });
    };

    /** Kursor holati (CSS klass) — faqat o'zgarganda DOM'ga yoziladi */
    const syncCursor = () => {
      const next = S.charge ? 'is-charging' : S.phase === 'moving' || S.phase === 'striking' ? 'is-busy' : '';
      if (next === S.cursor) return;
      if (S.cursor) wrap.classList.remove(S.cursor);
      if (next) wrap.classList.add(next);
      S.cursor = next;
    };

    /* ------------------------------------------------------------ Sikl */

    const frame = (ts: number) => {
      S.raf = 0;
      const dt = S.prev ? Math.min(0.1, (ts - S.prev) / 1000) : 0;
      S.prev = ts;
      update(ts, dt);
      if (S.flashes.length) S.flashes = S.flashes.filter((f) => ts - f.at < FLASH_MS);
      if (S.pops.length) S.pops = S.pops.filter((p) => ts - p.at < POP_MS);
      if (S.shake) {
        const off = shakeOffset(S.shake.amp, ts - S.shake.at);
        if (ts - S.shake.at > 200) {
          S.shake = null;
          wrap.style.transform = '';
        } else wrap.style.transform = `translate(${off.x.toFixed(2)}px, ${off.y.toFixed(2)}px)`;
      }
      syncCursor();
      draw(ts);
      S.raf = requestAnimationFrame(frame);
      // Keyingi kadr allaqachon rejalashtirilgan — ishlovchi qancha vaqt olsa ham sikl to'xtamaydi
      flushGame();
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
        cancelCharge();
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
      // CSS o'lchami billiard.css da (absolute, 100%) — faqat piksel buferi
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      S.view = computeView(world.table, w, h, dpr);
      S.layer = buildTableLayer(world.table, S.view);
      // Yog'och korpus burchagi bilan bir xil radius — soya to'g'ri tushsin
      wrap.style.borderRadius = `${1.8 * S.view.s}px`;
      // Bort ustidagi tugmalar shar o'lchamiga bog'langan (billiard.css)
      wrap.style.setProperty('--bt-u', `${S.view.s.toFixed(3)}px`);
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
      S.pointer.inside =
        e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      S.lastInteract = performance.now();
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) {
        // O'ng tugma — yig'ilayotgan zarbani bekor qilish
        if (e.button === 2) cancelCharge();
        return;
      }
      toLocal(e);
      S.pointer.pressed = true;
      setShowHint(false);
      sound.unlock();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* eski brauzer — capture'siz ham ishlaydi */
      }
      if (!canAim()) return;
      S.phase = 'aiming';
      updateAim();
      S.charge = { start: performance.now(), pointerId: e.pointerId, touch: e.pointerType !== 'mouse' };
    };
    const onMove = (e: PointerEvent) => {
      toLocal(e);
      if (S.charge) {
        // Kuch yig'ilayotganda o'ng tugma bosildi — bekor
        if (e.buttons & 2) {
          cancelCharge();
          return;
        }
        updateAim();
        return;
      }
      if (e.pointerType === 'mouse' && canAim()) {
        S.phase = 'aiming';
        updateAim();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!S.pointer.pressed) return;
      toLocal(e);
      S.pointer.pressed = false;
      const charge = S.charge;
      S.charge = null;
      if (charge && charge.pointerId === e.pointerId && S.phase === 'aiming') {
        if (S.pointer.inside && S.aim.valid && canAim()) {
          const now = performance.now();
          const power = chargePower(now - charge.start);
          const { side, vertical } = spinNow();
          beginStrike(
            { dirX: S.aim.dirX, dirY: S.aim.dirY, speed: powerToSpeed(power), side, vertical },
            'user',
            now,
            power,
            charge.touch,
          );
        } else if (!S.pointer.inside) S.phase = 'idle';
      }
      if (e.pointerType !== 'mouse') S.pointer.inside = false;
    };
    const onLeave = () => {
      if (S.pointer.pressed) return;
      S.pointer.inside = false;
      if (S.phase === 'aiming' && !S.charge) S.phase = 'idle';
    };
    const onCancel = () => {
      S.pointer.pressed = false;
      S.pointer.inside = false;
      S.charge = null;
      if (S.phase === 'aiming') S.phase = 'idle';
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && S.charge) {
        cancelCharge();
        S.pointer.pressed = false;
      }
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onTouchMove = (e: TouchEvent) => {
      if (S.charge?.touch && e.cancelable && performance.now() - S.charge.start > TOUCH_LOCK_MS) e.preventDefault();
    };
    const onVisibility = () => {
      S.pageVisible = !document.hidden;
      if (document.hidden) cancelCharge();
      sync();
    };

    apiRef.current = {
      rerack: () => {
        rackBalls(world, rng);
        events.length = 0;
        S.pending = null;
        S.after = null;
        S.charge = null;
        S.phase = 'idle';
        S.lastBy = 'user';
        S.lastInteract = performance.now();
        S.settledAt = performance.now();
        S.flashes = [];
        S.pops = [];
        setStats({ shots: 0, pocketed: 0 });
        showToast(tRef.current('billiard.newRack'));
        emitGame({ type: 'rack', reason: 'button' });
        // Tugma bosilishi fizika qadamidan tashqarida — darhol uzatsa bo'ladi
        flushGame();
        if (!S.raf) draw(performance.now());
      },
      hold: (on: boolean) => {
        // Yopilganda ham namoyish darhol boshlanmasin — lekin sahifa ochilganda kutmasin
        if (on || S.hold) S.lastInteract = performance.now();
        S.hold = on;
        if (on && S.pending?.by === 'ai') {
          S.pending = null;
          S.phase = 'idle';
        }
      },
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
      canvas.addEventListener('contextmenu', onContextMenu);
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('keydown', onKey);
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
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
      wrap.style.transform = '';
      apiRef.current = null;
      soundRef.current = null;
      sound.dispose();
    };
  }, []);

  // Ovoz holati — sintezatorga va brauzer xotirasiga
  useEffect(() => {
    soundRef.current?.setMuted(muted);
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* xususiy rejim — xotirasiz ham ishlaydi */
    }
  }, [muted]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Vint tanlagich ochilganda fokus unga, yopilganda — tugmaga qaytadi
  useEffect(() => {
    apiRef.current?.hold(spinOpen);
    if (spinOpen) pickerRef.current?.focus();
  }, [spinOpen]);

  const closePicker = () => {
    setSpinOpen(false);
    spinBtnRef.current?.focus();
  };

  const setSpinFrom = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const r = rect.width / 2 || 1;
    // Nuqta vidjetning 80% radiusigacha boradi (CSS: --sx · 40%)
    setSpin(clampSpinPoint((e.clientX - rect.left - r) / (r * 0.8), (e.clientY - rect.top - r) / (r * 0.8)));
  };
  const releasePicker = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ko'rsatkich allaqachon yo'q */
    }
  };
  const onPickerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ko'rsatkich allaqachon qo'yib yuborilgan — capture'siz ham ishlaydi */
    }
    tapStartRef.current = { x: e.clientX, y: e.clientY };
    setSpinFrom(e);
  };
  const onPickerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current === e.pointerId) setSpinFrom(e);
  };
  const onPickerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    const now = performance.now();
    // Surish emas, tegish bo'lsa: ikki marta tegish/bosish — markazga
    const moved = Math.hypot(e.clientX - tapStartRef.current.x, e.clientY - tapStartRef.current.y);
    if (moved > 8) lastTapRef.current = 0;
    else if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      setSpin({ x: 0, y: 0 });
      lastTapRef.current = 0;
    } else lastTapRef.current = now;
    releasePicker(e);
  };
  const onPickerKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = 0.1;
    const move = (dx: number, dy: number) => setSpin((s) => clampSpinPoint(s.x + dx, s.y + dy));
    if (e.key === 'ArrowUp') move(0, -step);
    else if (e.key === 'ArrowDown') move(0, step);
    else if (e.key === 'ArrowLeft') move(-step, 0);
    else if (e.key === 'ArrowRight') move(step, 0);
    else if (e.key === 'Home' || e.key === '0') setSpin({ x: 0, y: 0 });
    else if (e.key === 'Escape' || e.key === 'Enter') closePicker();
    else return;
    e.preventDefault();
  };

  const spinText = (() => {
    const { side, vertical } = spinFromPoint(spin.x, spin.y);
    const pct = (v: number) => Math.round((Math.abs(v) / SPIN_MAX) * 100);
    const parts: string[] = [];
    if (pct(vertical) >= 5) {
      parts.push(t(vertical > 0 ? 'billiard.spinFollow' : 'billiard.spinDraw', { n: pct(vertical) }));
    }
    if (pct(side) >= 5) parts.push(t(side > 0 ? 'billiard.spinRight' : 'billiard.spinLeft', { n: pct(side) }));
    return parts.length ? parts.join(', ') : t('billiard.spinCenter');
  })();
  const dotStyle = { '--sx': spin.x.toFixed(3), '--sy': spin.y.toFixed(3) } as CSSProperties;

  const toggleMute = () => {
    soundRef.current?.unlock();
    setShowHint(false);
    setMuted((m) => !m);
  };

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-label={t('billiard.group')}
      className={['bt-root', className].filter(Boolean).join(' ')}
      style={{
        aspectRatio: ASPECT,
        borderRadius: TOKENS.radius.lg,
        boxShadow: '0 40px 90px rgba(0, 0, 0, 0.6), 0 12px 24px rgba(0, 0, 0, 0.35)',
        // Vertikal surish sahifani aylantiradi (telefonda stol "tuzoq" bo'lmasin),
        // bosib turish va gorizontal tortish — mo'ljal
        touchAction: 'pan-y',
        ...style,
      }}
    >
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel ?? t('billiard.aria')} />

      {!reduced && (
        <>
          {stats.shots > 0 && (
            <div className="bt-rail bt-rail--tl">
              <div
                className="bt-stats"
                aria-label={t('billiard.statsAria', { pocketed: stats.pocketed, shots: stats.shots })}
              >
                <span title={t('billiard.pocketed')}>
                  <i aria-hidden />
                  {stats.pocketed}
                </span>
                <span title={t('billiard.shots')}>
                  <b aria-hidden />
                  {stats.shots}
                </span>
              </div>
            </div>
          )}

          <div className="bt-rail bt-rail--tr">
            <button
              type="button"
              className={`bt-btn${muted ? ' is-muted' : ''}`}
              aria-label={muted ? t('billiard.soundOn') : t('billiard.soundOff')}
              title={muted ? t('billiard.soundOn') : t('billiard.soundOff')}
              onClick={toggleMute}
            >
              {muted ? <MutedOutlined /> : <SoundOutlined />}
            </button>
            <button
              type="button"
              className="bt-btn"
              aria-label={t('billiard.rerack')}
              title={t('billiard.rerack')}
              onClick={() => {
                setShowHint(false);
                apiRef.current?.rerack();
              }}
            >
              <ReloadOutlined />
            </button>
          </div>

          <div className="bt-rail bt-rail--bl">
            <button
              ref={spinBtnRef}
              type="button"
              className="bt-btn bt-spin-btn"
              aria-label={`${t('billiard.spinOpen')} — ${spinText}`}
              aria-expanded={spinOpen}
              title={`${t('billiard.spinPicker')}: ${spinText}`}
              onClick={() => {
                setShowHint(false);
                setSpinOpen((open) => !open);
              }}
            >
              <span className="bt-ball" aria-hidden>
                <span className="bt-dot" style={dotStyle} />
              </span>
            </button>
          </div>

          {spinOpen && (
            <div
              className="bt-picker-backdrop"
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) closePicker();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closePicker();
              }}
            >
              <div className="bt-picker-col">
                <small aria-hidden>{t('billiard.spinTop')}</small>
                <div
                  ref={pickerRef}
                  className="bt-picker"
                  role="group"
                  tabIndex={0}
                  aria-label={`${t('billiard.spinPicker')}: ${spinText}. ${t('billiard.spinHint')}`}
                  onPointerDown={onPickerDown}
                  onPointerMove={onPickerMove}
                  onPointerUp={onPickerUp}
                  onPointerCancel={(e) => {
                    dragRef.current = null;
                    releasePicker(e);
                  }}
                  onKeyDown={onPickerKey}
                >
                  <span className="bt-ball" aria-hidden>
                    <span className="bt-dot" style={dotStyle} />
                  </span>
                </div>
                <small aria-hidden>{t('billiard.spinBack')}</small>
              </div>
              <div className="bt-picker-side">
                <strong>{t('billiard.spinPicker')}</strong>
                <p>{spinText}</p>
                <p>{t('billiard.spinHint')}</p>
                <button type="button" className="bt-done" onClick={closePicker}>
                  {t('billiard.spinDone')}
                </button>
              </div>
              <button
                type="button"
                className="bt-btn bt-picker-close"
                aria-label={t('billiard.spinDone')}
                onClick={closePicker}
              >
                <CloseOutlined />
              </button>
            </div>
          )}

          {showHint && (
            <div className="bt-hint" aria-hidden>
              <strong>{hint ?? t('billiard.goal')}</strong>
              <span>{t('billiard.howTo')}</span>
            </div>
          )}

          {toast && (
            <div key={toast.id} className="bt-toast" aria-hidden>
              {toast.text}
            </div>
          )}
          <div className="bt-sr" aria-live="polite">
            {toast?.text ?? ''}
          </div>
        </>
      )}
    </div>
  );
};

export default BilliardTable;
