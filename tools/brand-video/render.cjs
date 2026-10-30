// BILLIARD CLUB — brend videolari: logo animatsiyasini kadrma-kadr chizadi va ffmpeg bilan kodlaydi.
//
// Animatsiya sayt/dastur intro'si bilan BITTA kod: client/src/brand/logoMotion.ts
// (esbuild bilan shu yerda yig'iladi), shuning uchun video va dastur ichidagi
// animatsiya kadrma-kadr bir xil.
//
//   desktop/node_modules/.bin/electron tools/brand-video/render.cjs --out=client/public/brand
//   ... --only=16x9                      faqat bitta format
//   ... --preview=16x9 --out=sheet.png   dizayn tekshiruvi uchun kontakt varaq
//   ... --still=16x9 --t=4.4 --out=a.png bitta kadr
//
// ffmpeg: --ffmpeg=... yoki FFMPEG_PATH muhit o'zgaruvchisi yoki PATH dagi ffmpeg.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { spawn } = require('node:child_process');

const args = Object.fromEntries(
  process.argv
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...v] = a.slice(2).split('=');
      return [k, v.length ? v.join('=') : 'true'];
    }),
);

const ROOT = path.resolve(__dirname, '..', '..');
const ENGINE = path.join(ROOT, 'client', 'src', 'brand', 'logoMotion.ts');
const FORMATS = ['16x9', '9x16', '1x1'];
const FILE_BASE = 'billiardclub-logo';

const ffmpegPath = () => args.ffmpeg || process.env.FFMPEG_PATH || 'ffmpeg';

const bundle = (format) => {
  const esbuild = require(path.join(ROOT, 'client', 'node_modules', 'esbuild'));
  const result = esbuild.buildSync({
    entryPoints: [ENGINE],
    bundle: true,
    format,
    globalName: format === 'iife' ? 'LogoMotion' : undefined,
    target: 'es2022',
    write: false,
  });
  return result.outputFiles[0].text;
};

const run = (cmd, argv) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} → ${code}`))));
  });

const dataUrlToFile = (dataUrl, file) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
};

async function renderVideo(win, format, outDir, audioFile) {
  const wc = win.webContents;
  const info = await wc.executeJavaScript(`setup(${JSON.stringify(format)})`);
  const out = path.join(outDir, `${FILE_BASE}-${format}.mp4`);
  fs.mkdirSync(outDir, { recursive: true });

  const ff = spawn(
    ffmpegPath(),
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-s',
      `${info.width}x${info.height}`,
      '-r',
      String(info.fps),
      '-i',
      'pipe:0',
      ...(audioFile ? ['-i', audioFile] : []),
      // Canvas sRGB → BT.709 (HD standarti); aniq yaxlitlash va to'liq rang interpolyatsiyasi
      '-vf',
      'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '16',
      '-tune',
      'animation',
      // aq-mode=3: qorong'i sohalarga ko'proq bit — fon gradientlarida pog'ona bo'lmasin
      '-x264-params',
      'aq-mode=3',
      '-profile:v',
      'high',
      '-level',
      '4.2',
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-color_range',
      'tv',
      ...(audioFile ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest'] : ['-an']),
      '-movflags',
      '+faststart',
      out,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const exited = new Promise((resolve, reject) => {
    ff.on('error', reject);
    ff.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg → ${code}`))));
  });

  const pending = new Map();
  const onFrame = (_event, index, data) => {
    const resolve = pending.get(index);
    pending.delete(index);
    if (resolve) resolve(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  };
  ipcMain.on('frame-data', onFrame);
  try {
    for (let i = 0; i < info.frames; i += 1) {
      const frame = await new Promise((resolve) => {
        pending.set(i, resolve);
        wc.send('render-frame', i);
      });
      if (!ff.stdin.write(frame)) await once(ff.stdin, 'drain');
      if (i % 60 === 0) process.stdout.write(`  ${format}: ${i}/${info.frames}\r`);
    }
  } finally {
    ipcMain.removeListener('frame-data', onFrame);
  }
  ff.stdin.end();
  await exited;

  // Muqova (poster) — yakuniy kompozitsiya, manzil yozuvi bilan
  const poster = path.join(outDir, `${FILE_BASE}-${format}.jpg`);
  const png = path.join(os.tmpdir(), `bc-poster-${format}.png`);
  dataUrlToFile(await wc.executeJavaScript('frameDataUrl(4.4)'), png);
  await run(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-q:v', '2', poster]);
  fs.rmSync(png, { force: true });

  const size = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
  console.log(`  ${format}: ${path.relative(ROOT, out)} (${size} MB), ${path.relative(ROOT, poster)}`);
}

async function main() {
  const win = new BrowserWindow({
    show: false,
    width: 480,
    height: 320,
    webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false },
  });
  await win.loadFile(path.join(__dirname, 'page.html'), { query: { root: ROOT } });
  await win.webContents.executeJavaScript(`${bundle('iife')};window.LogoMotion = LogoMotion;true`);
  await win.webContents.executeJavaScript('fontsReady');

  if (args.preview) {
    const times = (args.times || '0.12,0.2,0.32,0.5,0.7,0.85,1.0,1.2,1.4,1.6,1.84,1.95,2.15,2.35,2.6,4.4')
      .split(',')
      .map(Number);
    await win.webContents.executeJavaScript(`setup(${JSON.stringify(args.preview)})`);
    const url = await win.webContents.executeJavaScript(
      `contactSheet(${JSON.stringify(times)}, ${Number(args.thumb) || 480}, ${Number(args.cols) || 4})`,
    );
    dataUrlToFile(url, path.resolve(args.out || 'brand-preview.png'));
    console.log(`preview: ${path.resolve(args.out || 'brand-preview.png')}`);
    return;
  }

  if (args.still) {
    await win.webContents.executeJavaScript(`setup(${JSON.stringify(args.still)})`);
    const url = await win.webContents.executeJavaScript(`frameDataUrl(${Number(args.t) || 0})`);
    dataUrlToFile(url, path.resolve(args.out || 'brand-still.png'));
    console.log(`still: ${path.resolve(args.out || 'brand-still.png')}`);
    return;
  }

  const outDir = path.resolve(ROOT, args.out || path.join('client', 'public', 'brand'));
  let audioFile = null;
  if (args.audio !== 'false') {
    // Ovoz ham animatsiya lahzalariga bog'langan (introEvents) — alohida modulda sintez qilinadi
    const engineFile = path.join(os.tmpdir(), 'bc-logo-motion.cjs');
    fs.writeFileSync(engineFile, bundle('cjs'));
    const { introEvents } = require(engineFile);
    const { synthesize } = require('./audio.cjs');
    audioFile = path.join(os.tmpdir(), 'bc-logo-audio.wav');
    const report = synthesize(introEvents(), { duration: 6, file: audioFile });
    console.log(`audio: ${report.lufs.toFixed(1)} LUFS, cho'qqi ${report.peakDb.toFixed(1)} dBFS`);
  }
  const formats = args.only ? args.only.split(',') : FORMATS;
  for (const format of formats) await renderVideo(win, format, outDir, audioFile);
}

app
  .whenReady()
  .then(main)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
