/**
 * Billiard ovozlari — WebAudio bilan sintez qilinadi, audio fayl yo'q.
 *
 * Brauzerlar ovozni faqat foydalanuvchi harakatidan keyin ruxsat beradi,
 * shuning uchun AudioContext `unlock()` da (birinchi bosishda) yaratiladi.
 * Razbiyda bir soniyada o'nlab tegish bo'ladi — cheklagich ularni
 * "chiq-chiq" shovqiniga aylantirmaydi.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Urilish tezligi → balandlik (0..1); quloq logarifmik — yumshoq egri */
export const impactGain = (speed: number, reference: number): number =>
  clamp01(speed / reference) ** 0.8;

/** `windowMs` ichida ko'pi bilan `max` ta tovush */
export const createRateLimiter = (max: number, windowMs: number) => {
  const times: number[] = [];
  return (now: number): boolean => {
    while (times.length > 0 && now - times[0] > windowMs) times.shift();
    if (times.length >= max) return false;
    times.push(now);
    return true;
  };
};

export interface BilliardSound {
  /** Foydalanuvchi harakatida chaqiriladi — AudioContext shunda tug'iladi */
  unlock(): void;
  /** Kontekst yaratilganmi (ya'ni tashrif buyuruvchi stolga tekkanmi) */
  readonly unlocked: boolean;
  setMuted(muted: boolean): void;
  /** Kiy zarbasi; `power` 0..1 */
  cue(power: number): void;
  /** Shar–shar; `speed` R/s, `gain` — umumiy ko'paytiruvchi (namoyish uchun past) */
  click(speed: number, gain?: number): void;
  cushion(speed: number, gain?: number): void;
  pocket(gain?: number): void;
  dispose(): void;
}

type AudioCtor = typeof AudioContext;

const audioCtor = (): AudioCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
};

const MASTER_GAIN = 0.75;

export const createBilliardSound = (): BilliardSound => {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let muted = false;
  const clickLimit = createRateLimiter(6, 45);
  const cushionLimit = createRateLimiter(3, 60);
  const pocketLimit = createRateLimiter(2, 90);

  const now = () => (ctx ? ctx.currentTime : 0);

  /** Qisqa "zarb" konverti: tez ko'tarilish, eksponensial so'nish */
  const envelope = (param: AudioParam, at: number, peak: number, decay: number) => {
    param.setValueAtTime(0.0001, at);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.0025);
    param.exponentialRampToValueAtTime(0.0001, at + decay);
  };

  const tone = (type: OscillatorType, from: number, to: number, at: number, peak: number, decay: number) => {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + decay);
    envelope(gain.gain, at, peak, decay);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + decay + 0.02);
  };

  const burst = (filter: BiquadFilterType, freq: number, q: number, at: number, peak: number, decay: number) => {
    if (!ctx || !master || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    // Har safar boshqa bo'lak — bir xil "shitirlash" takrorlanmasin
    const offset = Math.random() * (noise.duration - decay - 0.05);
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.value = freq;
    biquad.Q.value = q;
    const gain = ctx.createGain();
    envelope(gain.gain, at, peak, decay);
    src.connect(biquad).connect(gain).connect(master);
    src.start(at, Math.max(0, offset), decay + 0.03);
  };

  const ready = () => ctx !== null && master !== null && !muted && ctx.state === 'running';

  return {
    get unlocked() {
      return ctx !== null;
    },
    unlock() {
      if (ctx) {
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
        return;
      }
      const Ctor = audioCtor();
      if (!Ctor) return;
      try {
        ctx = new Ctor();
      } catch {
        ctx = null;
        return;
      }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_GAIN;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 6;
      master.connect(compressor).connect(ctx.destination);
      // 0.6 s oq shovqin — barcha "shitirlash"lar shu buferdan
      const length = Math.round(ctx.sampleRate * 0.6);
      noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    },
    setMuted(value: boolean) {
      muted = value;
      if (ctx && master) master.gain.setTargetAtTime(value ? 0 : MASTER_GAIN, ctx.currentTime, 0.02);
    },
    cue(power: number) {
      if (!ready()) return;
      const p = clamp01(power);
      const at = now();
      const g = 0.3 + 0.7 * p;
      // Charm uchining "tok"i + yog'och kiy tanasi
      tone('triangle', 720 + 260 * p, 380, at, 0.32 * g, 0.075);
      tone('sine', 190, 120, at, 0.22 * g, 0.09);
      burst('bandpass', 2300 + 900 * p, 1.1, at, 0.24 * g, 0.035);
    },
    click(speed: number, gain = 1) {
      if (!ready() || !clickLimit(performance.now())) return;
      const g = impactGain(speed, 70) * gain;
      if (g < 0.02) return;
      const at = now();
      // Fil suyagi kabi qattiq shar: baland, juda qisqa "chiq"
      tone('sine', 2900 + Math.random() * 700, 2300, at, 0.42 * g, 0.03 + 0.02 * g);
      burst('highpass', 5200, 0.7, at, 0.18 * g, 0.014);
    },
    cushion(speed: number, gain = 1) {
      if (!ready() || !cushionLimit(performance.now())) return;
      const g = impactGain(speed, 60) * gain;
      if (g < 0.03) return;
      const at = now();
      // Rezina bort — bo'g'iq, past "gup"
      burst('lowpass', 320, 0.8, at, 0.5 * g, 0.09);
      tone('sine', 105, 70, at, 0.36 * g, 0.12);
    },
    pocket(gain = 1) {
      if (!ready() || !pocketLimit(performance.now())) return;
      const at = now();
      // Charm cho'ntak: ikki bo'g'iq zarb va qisqa dumalash shitirlashi
      tone('sine', 175, 115, at, 0.5 * gain, 0.09);
      burst('lowpass', 900, 0.9, at + 0.03, 0.22 * gain, 0.16);
      tone('sine', 140, 85, at + 0.075, 0.38 * gain, 0.13);
    },
    dispose() {
      const c = ctx;
      ctx = null;
      master = null;
      noise = null;
      if (c) void c.close().catch(() => {});
    },
  };
};
