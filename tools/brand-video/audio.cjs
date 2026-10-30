// Brend videosi ovozi — to'liq sintez (namuna fayllari yo'q, litsenziya muammosi yo'q).
// Har tovush animatsiya lahzasiga bog'langan (logoMotion.ts → introEvents):
//   chiroq "chirt"lari · chiziq shitirlashi · kiy shuvillashi va "tak" · sharlar dumalashi ·
//   sharlar tegishi ("chiq") · yaltirash qo'ng'irog'i · yozuv chiqqandagi past "bum" va iliq akkord.
const fs = require('node:fs');

const RATE = 48000;

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};

/**
 * RBJ biquad (lowpass / highpass / bandpass). `filter.set(freq)` chastotani
 * holatni saqlagan holda o'zgartiradi — shuvillashda "chirsillash" bo'lmaydi.
 */
const biquad = (type, freq, q) => {
  let b0;
  let b1;
  let b2;
  let a0;
  let a1;
  let a2;
  const set = (f) => {
    const w = (2 * Math.PI * Math.min(f, RATE * 0.45)) / RATE;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    if (type === 'lowpass') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
    } else if (type === 'highpass') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  };
  set(freq);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const run = (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
  run.set = set;
  return run;
};

function synthesize(events, { duration = 6, file }) {
  const n = Math.round(duration * RATE);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const sendL = new Float32Array(n);
  const sendR = new Float32Array(n);
  const rnd = mulberry32(73);
  const noise = () => rnd() * 2 - 1;

  /** Bitta namunani stereo panorama (−1 chap … +1 o'ng) va reverb yuborish bilan qo'shadi */
  const put = (i, v, pan = 0, send = 0.18) => {
    if (i < 0 || i >= n) return;
    const l = Math.cos(((pan + 1) * Math.PI) / 4);
    const r = Math.sin(((pan + 1) * Math.PI) / 4);
    L[i] += v * l;
    R[i] += v * r;
    sendL[i] += v * l * send;
    sendR[i] += v * r * send;
  };
  const at = (t) => Math.round(t * RATE);

  /** So'nuvchi sinuslar yig'indisi — urilish tovushlari (modal sintez) */
  const modal = (t, modes, { gain = 1, pan = 0, send = 0.2, click = 0, clickHp = 1500, attack = 0.0002 } = {}) => {
    const start = at(t);
    const longest = Math.max(...modes.map((m) => m.decay)) * 7;
    const hp = biquad('highpass', clickHp, 0.7);
    const len = Math.round(longest * RATE);
    for (let k = 0; k < len; k += 1) {
      const s = k / RATE;
      const env = Math.min(1, s / attack);
      let v = 0;
      for (const m of modes) v += m.gain * Math.exp(-s / m.decay) * Math.sin(2 * Math.PI * m.freq * s + (m.phase ?? 0));
      if (click && s < 0.004) v += click * hp(noise()) * Math.exp(-s / 0.0009);
      put(start + k, gain * env * v, pan, send);
    }
  };

  /** Filtrlangan shovqin, vaqt bo'yicha o'zgaruvchan */
  const noiseBed = (t0, t1, { filter, amp, pan = () => 0, send = 0.2, seedShift = 0 }) => {
    const a = at(t0);
    const b = at(t1);
    for (let k = 0; k < seedShift; k += 1) rnd();
    for (let i = a; i < b; i += 1) {
      const u = (i - a) / (b - a);
      const v = filter(noise(), u);
      put(i, amp(u) * v, pan(u), send);
    }
  };

  // 1) Chiroq yonishi — har miltillashda qisqa elektr "chirt"
  events.lampTicks.forEach((t, idx) => {
    const hp = biquad('highpass', 2400, 0.8);
    const start = at(t);
    for (let k = 0; k < RATE * 0.012; k += 1) {
      const s = k / RATE;
      put(start + k, (idx === 0 ? 0.09 : 0.06) * hp(noise()) * Math.exp(-s / 0.0028), 0, 0.25);
    }
    if (idx === 0) modal(t, [{ freq: 96, decay: 0.05, gain: 1 }], { gain: 0.07, send: 0.1 });
  });

  // 2) Oltin chiziq chiziladi — ikki uchi chap va o'ngga tarqaladigan nozik shitirlash
  for (const side of [-1, 1]) {
    const bp = biquad('bandpass', 7200, 1.6);
    noiseBed(events.rim[0], events.rim[1] + 0.05, {
      filter: (x) => bp(x),
      amp: (u) => 0.035 * Math.sin(Math.PI * Math.min(1, u)) ** 1.4,
      pan: (u) => side * Math.sin(Math.PI * u) * 0.85,
      send: 0.3,
      seedShift: side > 0 ? 17 : 0,
    });
  }

  // 3) Kiy ko'tariladi — shuvillash, joyiga tushganda yog'och "tak"
  {
    const [c0, c1] = events.cueRise;
    const bp = biquad('bandpass', 260, 2.2);
    noiseBed(c0 - 0.04, c1 + 0.06, {
      filter: (x, u) => {
        bp.set(260 * Math.pow(2400 / 260, Math.min(1, u * 1.05)));
        return bp(x);
      },
      amp: (u) => 0.32 * Math.pow(Math.min(1, u * 1.08), 2.2) * (u > 0.92 ? Math.max(0, 1 - (u - 0.92) / 0.08) : 1),
      send: 0.22,
    });
    modal(
      events.cueLand,
      [
        { freq: 178, decay: 0.07, gain: 1 },
        { freq: 612, decay: 0.026, gain: 0.32 },
        { freq: 1490, decay: 0.012, gain: 0.12 },
      ],
      { gain: 0.26, click: 0.25, clickHp: 900, send: 0.16 },
    );
  }

  // 4) Sharlar dumalaydi (past gumburlash, tezlik bilan so'nadi) va kiyga "taq" etib taqaladi
  const rollSound = (span, pan0, seed) => {
    const lp1 = biquad('lowpass', 190, 0.8);
    const lp2 = biquad('lowpass', 190, 0.8);
    const hp = biquad('highpass', 45, 0.7);
    noiseBed(span[0], span[1] + 0.02, {
      filter: (x) => hp(lp2(lp1(x))),
      amp: (u) => 0.55 * (1 - 0.75 * Math.min(1, u)) * Math.min(1, u * 8),
      pan: (u) => pan0 * (1 - u) - 0.05,
      send: 0.08,
      seedShift: seed,
    });
  };
  rollSound(events.ballBRoll, 0.7, 5);
  rollSound(events.ballARoll, 0.75, 11);
  modal(
    events.ballBDock,
    [
      { freq: 432, decay: 0.035, gain: 1 },
      { freq: 1180, decay: 0.017, gain: 0.4 },
      { freq: 2350, decay: 0.008, gain: 0.15 },
    ],
    { gain: 0.22, click: 0.18, clickHp: 1800, pan: -0.08, send: 0.18 },
  );

  // 5) Sharlar tegishi — asosiy "chiq" (fenol shar ovozi: yorqin, qisqa)
  const clack = (t, gain, pitch) =>
    modal(
      t,
      [
        { freq: 2790 * pitch, decay: 0.034, gain: 1 },
        { freq: 3940 * pitch, decay: 0.024, gain: 0.74 },
        { freq: 5230 * pitch, decay: 0.017, gain: 0.52 },
        { freq: 6880 * pitch, decay: 0.012, gain: 0.36 },
        { freq: 8810 * pitch, decay: 0.008, gain: 0.24 },
        { freq: 540 * pitch, decay: 0.016, gain: 0.42 },
      ],
      { gain, click: 0.5, clickHp: 1200, pan: -0.05, send: 0.24, attack: 0.00015 },
    );
  clack(events.kiss, 0.3, 1);
  clack(events.kiss + 0.024, 0.06, 1.06);

  // 6) Yorug'lik o'tadi — chapdan o'ngga ketma-ket yaltirash qo'ng'irog'i
  {
    const [s0, s1] = events.sheen;
    const notes = [2637.02, 3520, 4698.63, 5274.04];
    notes.forEach((f, i) => {
      const t = s0 + 0.06 + ((s1 - s0) * 0.62 * i) / (notes.length - 1);
      modal(
        t,
        [
          { freq: f, decay: 0.42 - i * 0.05, gain: 1 },
          { freq: f * 2.01, decay: 0.12, gain: 0.18 },
        ],
        { gain: 0.03 - i * 0.003, pan: -0.55 + (1.1 * i) / (notes.length - 1), send: 0.45, attack: 0.004 },
      );
    });
    const hp = biquad('highpass', 6500, 0.7);
    noiseBed(s0, s1, {
      filter: (x) => hp(x),
      amp: (u) => 0.03 * Math.sin(Math.PI * u) ** 2,
      pan: (u) => -0.6 + 1.2 * u,
      send: 0.4,
      seedShift: 23,
    });
  }

  // 7) Yozuv chiqadi — past "bum" (iliq, chuqur) va sekin ochiladigan akkord
  {
    const t0 = events.word[0];
    const start = at(t0);
    let phase = 0;
    for (let k = 0; k < RATE * 2.4; k += 1) {
      const s = k / RATE;
      const f = 44 + (74 - 44) * Math.exp(-s / 0.16);
      phase += (2 * Math.PI * f) / RATE;
      const env = Math.min(1, s / 0.008) * Math.exp(-s / 0.5);
      // Kichik karnaylarda ham eshitilsin: asosiy ton pastroq, ustiga garmonikalar
      put(start + k, env * (0.2 * Math.sin(phase) + 0.07 * Math.sin(2 * phase) + 0.025 * Math.sin(3 * phase)), 0, 0.02);
    }
    const lp = biquad('lowpass', 420, 0.7);
    for (let k = 0; k < RATE * 0.12; k += 1) {
      const s = k / RATE;
      put(start + k, 0.1 * lp(noise()) * Math.exp(-s / 0.03), 0, 0.1);
    }

    // D-dur (D3 A3 D4 F#4 A4) — har tovush ikki biroz farqli sinusdan (iliqlik)
    const chord = [146.83, 220, 293.66, 369.99, 440];
    const a0 = t0 + 0.02;
    const release0 = duration - 1.1;
    for (let i = at(a0); i < n; i += 1) {
      const s = i / RATE;
      const rise = Math.min(1, (s - a0) / 0.9);
      const attack = rise * rise * (3 - 2 * rise);
      const release = s > release0 ? Math.max(0, 1 - (s - release0) / (duration - release0 - 0.05)) : 1;
      const env = attack * release * release;
      if (env <= 0) continue;
      let v = 0;
      chord.forEach((f, idx) => {
        const det = 1 + 0.0015 * (idx % 2 ? 1 : -1);
        v += Math.sin(2 * Math.PI * f * s) + 0.8 * Math.sin(2 * Math.PI * f * det * s + idx) + 0.12 * Math.sin(4 * Math.PI * f * s);
      });
      put(i, 0.0105 * env * v, 0, 0.5);
    }
    // CLUB yaltirashi — juda nozik yuqori nota
    modal(t0 + 0.75, [{ freq: 6271.93, decay: 0.38, gain: 1 }], { gain: 0.014, pan: 0.35, send: 0.5, attack: 0.003 });
  }

  // Reverb (Schroeder: 4 ta comb + 2 allpass, kanallarda biroz farqli kechikishlar)
  const reverb = (input, offset) => {
    const combs = [1557, 1617, 1491, 1422].map((d) => ({ buf: new Float32Array(d + offset), i: 0, store: 0 }));
    const allpasses = [225, 556].map((d) => ({ buf: new Float32Array(d + offset), i: 0 }));
    const out = new Float32Array(n);
    for (let k = 0; k < n; k += 1) {
      const x = input[k];
      let y = 0;
      for (const c of combs) {
        const o = c.buf[c.i];
        c.store = o * 0.62 + c.store * 0.38;
        c.buf[c.i] = x + c.store * 0.82;
        c.i = (c.i + 1) % c.buf.length;
        y += o;
      }
      y *= 0.25;
      for (const a of allpasses) {
        const o = a.buf[a.i];
        const v = y + o * 0.5;
        a.buf[a.i] = v;
        a.i = (a.i + 1) % a.buf.length;
        y = o - v * 0.5;
      }
      out[k] = y;
    }
    return out;
  };
  const wetL = reverb(sendL, 0);
  const wetR = reverb(sendR, 23);

  // Yakun: aralashtirish va video oxirida so'nish
  const fade0 = duration - 0.5;
  const mixed = [new Float32Array(n), new Float32Array(n)];
  for (let k = 0; k < n; k += 1) {
    const s = k / RATE;
    const fade = s > fade0 ? Math.max(0, 1 - (s - fade0) / (duration - fade0)) : 1;
    mixed[0][k] = (L[k] + wetL[k] * 0.9) * fade * fade;
    mixed[1][k] = (R[k] + wetR[k] * 0.9) * fade * fade;
  }

  // Balandlik: −16 LUFS (ijtimoiy tarmoqlar uchun odatiy), cho'qqilar yumshoq cheklagich bilan −1 dBFS dan oshmaydi
  const gain = 10 ** ((-16 - loudness(mixed)) / 20);
  const ceiling = 10 ** (-1 / 20);
  let peak = 0;
  const pcm = Buffer.alloc(n * 4);
  for (let k = 0; k < n; k += 1) {
    const l = ceiling * Math.tanh((mixed[0][k] * gain) / ceiling);
    const r = ceiling * Math.tanh((mixed[1][k] * gain) / ceiling);
    mixed[0][k] = l;
    mixed[1][k] = r;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    pcm.writeInt16LE(Math.round(l * 32767), k * 4);
    pcm.writeInt16LE(Math.round(r * 32767), k * 4 + 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, pcm]));

  return { peakDb: 20 * Math.log10(peak), lufs: loudness(mixed), gain };
}

/** ITU-R BS.1770-4 integratsiyalangan balandlik (LUFS): K-filtr, 400 ms bloklar, ikki bosqichli gating */
function loudness(channels) {
  const stages = [
    [[1.53512485958697, -2.69169618940638, 1.19839281085285], [-1.69065929318241, 0.73248077421585]],
    [[1, -2, 1], [-1.99004745483398, 0.99007225036621]],
  ];
  const weighted = channels.map((x) => {
    let input = x;
    for (const [[b0, b1, b2], [a1, a2]] of stages) {
      const out = new Float32Array(input.length);
      let x1 = 0;
      let x2 = 0;
      let y1 = 0;
      let y2 = 0;
      for (let i = 0; i < input.length; i += 1) {
        const y = b0 * input[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = input[i];
        y2 = y1;
        y1 = y;
        out[i] = y;
      }
      input = out;
    }
    return input;
  });
  const block = Math.round(0.4 * RATE);
  const hop = Math.round(0.1 * RATE);
  const blocks = [];
  for (let s = 0; s + block <= weighted[0].length; s += hop) {
    let z = 0;
    for (const ch of weighted) {
      let sum = 0;
      for (let i = s; i < s + block; i += 1) sum += ch[i] * ch[i];
      z += sum / block;
    }
    blocks.push(z);
  }
  const lufs = (z) => -0.691 + 10 * Math.log10(z);
  const loud = blocks.filter((z) => lufs(z) > -70);
  if (!loud.length) return -70;
  const relative = lufs(loud.reduce((a, b) => a + b, 0) / loud.length) - 10;
  const gated = loud.filter((z) => lufs(z) > relative);
  return lufs(gated.reduce((a, b) => a + b, 0) / gated.length);
}

module.exports = { synthesize };
