/* global LogoMotion */
// Render sahifasi (Electron, faqat lokal fayllar): sahnalarni quradi va kadrlarni chizadi.
// LogoMotion — client/src/brand/logoMotion.ts dan esbuild bilan yig'ilgan to'plam (render.cjs yuklaydi).
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ipcRenderer } = require('electron');

const root = new URLSearchParams(location.search).get('root');
const FONTS = {
  display: "'Unbounded Variable', 'Inter Variable', sans-serif",
  text: "'Inter Variable', sans-serif",
};
const FPS = 60;
const DURATION = 6;

const fontFile = (rel) => pathToFileURL(path.join(root, 'client', 'node_modules', '@fontsource-variable', rel)).href;

window.fontsReady = (async () => {
  const faces = [
    new FontFace('Unbounded Variable', `url("${fontFile('unbounded/files/unbounded-latin-wght-normal.woff2')}")`, {
      weight: '200 900',
    }),
    new FontFace('Inter Variable', `url("${fontFile('inter/files/inter-latin-wght-normal.woff2')}")`, {
      weight: '100 900',
    }),
  ];
  for (const face of faces) {
    await face.load();
    document.fonts.add(face);
  }
  return true;
})();

const canvas = document.getElementById('frame');
let ctx = null;
let scene = null;
let dither = null;

/** Har format uchun kompozitsiya: yig'ilish joyi, yakuniy belgi+yozuv va oxirgi manzil */
const SCENES = {
  '16x9': (c) => {
    const W = 1920;
    const H = 1080;
    const cy = 520;
    const s = 224;
    const m = LogoMotion.measureWordmark(c, s * 0.38, FONTS.display);
    const total = s * 1.28 + m.width;
    const left = (W - total) / 2;
    return {
      width: W,
      height: H,
      build: { x: W / 2 - 190, y: cy - 190, size: 380 },
      lockup: {
        mark: { x: left, y: cy - s / 2, size: s },
        word: { x: left + s * 1.28, baseline: cy + m.baselineShift, size: s * 0.38, align: 'left', lines: 1 },
      },
      reveal: 'behind',
      endCard: { text: 'billiardclub.uz', baseline: H - 104, size: 28, at: 3.15 },
    };
  },
  '9x16': (c) => vertical(c, { W: 1080, H: 1920, build: 380, mark: 300, maxWidth: 820, cap: 132, lift: 70, card: 34, cardBottom: 230 }),
  '1x1': (c) => vertical(c, { W: 1080, H: 1080, build: 320, mark: 236, maxWidth: 700, cap: 100, lift: 34, card: 30, cardBottom: 92 }),
};

function vertical(c, o) {
  // Ikki qator: BILLIARD / CLUB — telefon ekranida yirik va o'qiladigan
  let size = o.cap;
  const first = LogoMotion.measureWordmark(c, size, FONTS.display, 2);
  if (first.width > o.maxWidth) size *= o.maxWidth / first.width;
  const m = LogoMotion.measureWordmark(c, size, FONTS.display, 2);
  const lineHeight = size * 1.16;
  const gap = o.mark * 0.2;
  const total = o.mark + gap + m.cap + lineHeight;
  const top = (o.H - total) / 2 - o.lift;
  const buildCy = top + o.mark / 2 + (total - o.mark) * 0.32;
  return {
    width: o.W,
    height: o.H,
    build: { x: (o.W - o.build) / 2, y: buildCy - o.build / 2, size: o.build },
    lockup: {
      mark: { x: (o.W - o.mark) / 2, y: top, size: o.mark },
      word: { x: o.W / 2, baseline: top + o.mark + gap + m.cap, size, align: 'center', lines: 2, lineHeight },
    },
    reveal: 'rise',
    endCard: { text: 'billiardclub.uz', baseline: o.H - o.cardBottom, size: o.card, at: 3.15 },
  };
}

window.setup = async (format) => {
  await window.fontsReady;
  const base = SCENES[format];
  if (!base) throw new Error(`Noma'lum format: ${format}`);
  // O'lchov uchun vaqtinchalik kontekst (canvas o'lchami keyin o'rnatiladi)
  const probe = document.createElement('canvas').getContext('2d');
  const s = base(probe);
  canvas.width = s.width;
  canvas.height = s.height;
  ctx = canvas.getContext('2d', { willReadFrequently: true });
  scene = {
    ...s,
    pixelRatio: 1,
    fonts: FONTS,
    camera: true,
    dust: true,
    fadeOut: [DURATION - 0.5, DURATION],
    sheens: [[4.1, 4.75]],
  };
  // Qorong'i gradientlarda "pog'onalar" ko'rinmasin: har kadrga bir xil (statik)
  // ±1 darajali shovqin — kodlovchi uni arzon siqadi, ko'z sezmaydi
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  dither = new Int8Array(s.width * s.height);
  for (let i = 0; i < dither.length; i += 1) dither[i] = Math.round(rnd() + rnd() - 1);
  return { width: s.width, height: s.height, fps: FPS, frames: Math.round(DURATION * FPS), duration: DURATION };
};

window.drawAt = (t) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  LogoMotion.drawIntroFrame(ctx, scene, t);
};

/** Dizayn tekshiruvi: bir nechta lahzani bitta rasmga yig'adi */
window.contactSheet = (times, thumbWidth, columns) => {
  const tw = thumbWidth;
  const th = Math.round((tw * canvas.height) / canvas.width);
  const cols = columns || 4;
  const rows = Math.ceil(times.length / cols);
  const sheet = document.createElement('canvas');
  sheet.width = cols * tw + (cols + 1) * 8;
  sheet.height = rows * (th + 26) + 8;
  const sc = sheet.getContext('2d');
  sc.fillStyle = '#202422';
  sc.fillRect(0, 0, sheet.width, sheet.height);
  times.forEach((t, i) => {
    window.drawAt(t);
    const x = 8 + (i % cols) * (tw + 8);
    const y = 8 + Math.floor(i / cols) * (th + 26);
    sc.drawImage(canvas, x, y, tw, th);
    sc.fillStyle = '#cfc7b5';
    sc.font = '14px sans-serif';
    sc.fillText(`t = ${t.toFixed(2)} s`, x, y + th + 17);
  });
  return sheet.toDataURL('image/png');
};

window.frameDataUrl = (t) => {
  window.drawAt(t);
  return canvas.toDataURL('image/png');
};

ipcRenderer.on('render-frame', (_event, index) => {
  window.drawAt(index / FPS);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let p = 0, i = 0; p < dither.length; p += 1, i += 4) {
    const n = dither[p];
    if (n === 0) continue;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
  }
  ipcRenderer.send('frame-data', index, data);
});
