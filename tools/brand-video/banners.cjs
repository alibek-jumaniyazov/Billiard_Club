// BILLIARD CLUB — ijtimoiy tarmoq / qidiruv bannerlari va ikonkalar.
//
// Landingdagi jonli demo panel (haqiqiy stol kartalari) suratga olinadi va
// brend kompozitsiyasiga joylanadi:
//   client/public/og-cover.png      1200×630, o'zbekcha (Google, Telegram, Facebook havola ko'rinishi)
//   client/public/og-cover-ru.png   1200×630, ruscha
//   client/public/favicon.ico       48×48 (qidiruv natijasidagi ikonka, eski brauzerlar)
//   client/public/brand/billiardclub-logo-1024.png  kvadrat logotip (Google Business, kataloglar)
//
//   desktop/node_modules/.bin/electron tools/brand-video/banners.cjs --url=http://localhost:5173 --ffmpeg=…
//
// --url — landing ochiladigan manzil (dev server yoki https://billiardclub.uz).
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const args = Object.fromEntries(
  process.argv
    .filter((a) => a.startsWith('--') && a.includes('='))
    .map((a) => {
      const [k, ...v] = a.slice(2).split('=');
      return [k, v.join('=')];
    }),
);
const ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'client', 'public');
const SITE = (args.url || 'http://localhost:5173').replace(/\/+$/, '');
const FFMPEG = args.ffmpeg || process.env.FFMPEG_PATH || 'ffmpeg';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-banners-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const font = (rel) => pathToFileURL(path.join(ROOT, 'client', 'node_modules', '@fontsource-variable', rel)).href;
const MARK_SVG = fs
  .readFileSync(path.join(PUBLIC, 'favicon.svg'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/width="48" height="48"/, 'width="100%" height="100%"');

const TEXT = {
  uz: {
    path: '/',
    file: 'og-cover.png',
    headline: 'Billiard klub<br>dasturi',
    sub: 'Stol taymeri · Bar va kassa · Qarzlar · Hisobotlar · Chiroq avtomatikasi',
    platforms: ['Windows', 'Android', 'Brauzer'],
    cta: '7 kun bepul',
  },
  ru: {
    path: '/ru/',
    file: 'og-cover-ru.png',
    headline: 'Программа для<br>бильярдного клуба',
    sub: 'Таймер столов · Бар и касса · Долги · Отчёты · Автосвет',
    platforms: ['Windows', 'Android', 'Браузер'],
    cta: '7 дней бесплатно',
  },
};

const run = (argv) => {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg ${argv.join(' ')}`);
};

/** Landingdagi demo panel — intro'siz */
async function captureBoard(lang) {
  const ses = session.fromPartition(`banner-${lang}-${Date.now()}`);
  const preload = path.join(TMP, `preload-${lang}.js`);
  fs.writeFileSync(preload, "try { sessionStorage.setItem('bc.intro.v1', '1'); } catch (e) {}");
  // Panel ~1080 px kenglikda tushadi — bannerda 640 px ga kichraytiriladi (aniq chiqadi)
  const win = new BrowserWindow({
    width: 1440,
    height: 1000,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true, session: ses, preload, sandbox: false, contextIsolation: false },
  });
  await win.loadURL(`${SITE}${TEXT[lang].path}`);
  await sleep(2500);
  const rect = await win.webContents.executeJavaScript(`(async () => {
    const el = document.querySelector('.lp-board');
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 2600));
    const r = el.getBoundingClientRect();
    return { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) };
  })()`);
  if (!rect) throw new Error(`.lp-board topilmadi: ${SITE}${TEXT[lang].path}`);
  const file = path.join(TMP, `board-${lang}.png`);
  fs.writeFileSync(file, (await win.webContents.capturePage(rect)).toPNG());
  return file;
}

const bannerHtml = (lang, boardFile) => {
  const t = TEXT[lang];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
@font-face { font-family: 'Unbounded'; src: url("${font('unbounded/files/unbounded-latin-wght-normal.woff2')}") format('woff2'); font-weight: 200 900; }
@font-face { font-family: 'Unbounded'; src: url("${font('unbounded/files/unbounded-cyrillic-wght-normal.woff2')}") format('woff2'); font-weight: 200 900; unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: 'Inter'; src: url("${font('inter/files/inter-latin-wght-normal.woff2')}") format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Inter'; src: url("${font('inter/files/inter-cyrillic-wght-normal.woff2')}") format('woff2'); font-weight: 100 900; unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; background: #090c0b; }
body { position: relative; font-family: 'Inter', sans-serif; color: #f1ece1; }
.light { position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 34% 58% at 72% -6%, rgba(255, 234, 192, .13), transparent 70%),
    radial-gradient(ellipse 46% 52% at 74% 58%, rgba(35, 160, 102, .22), transparent 72%),
    radial-gradient(ellipse 40% 50% at 18% 40%, rgba(35, 160, 102, .09), transparent 70%),
    radial-gradient(ellipse 120% 90% at 50% 50%, transparent 55%, rgba(0, 0, 0, .55)); }
.copy { position: absolute; left: 64px; top: 58px; width: 560px; }
.lockup { display: flex; align-items: center; gap: 16px; }
.mark { width: 60px; height: 60px; filter: drop-shadow(0 8px 18px rgba(0,0,0,.45)); }
.word { font-family: 'Unbounded'; font-weight: 700; font-size: 22px; letter-spacing: .08em; }
.word b { color: #dbb35c; font-weight: 700; }
h1 { margin-top: 42px; font-family: 'Unbounded'; font-weight: 750; font-size: ${lang === 'ru' ? 50 : 58}px; line-height: 1.06; letter-spacing: -.03em; }
h1 em { font-style: normal; color: #dbb35c; }
.sub { margin-top: 22px; font-size: 21px; line-height: 1.45; color: #b5ae9f; font-weight: 500; max-width: 520px; }
.row { position: absolute; left: 64px; bottom: 56px; display: flex; align-items: center; gap: 12px; }
.cta { padding: 13px 26px; border-radius: 999px; background: linear-gradient(135deg, #e8c677, #dbb35c 55%, #bd954a); color: #17130a; font-weight: 800; font-size: 20px; }
.chip { padding: 11px 16px; border-radius: 999px; border: 1px solid rgba(219,179,92,.28); background: rgba(219,179,92,.07); color: #e8dfcd; font-weight: 600; font-size: 16px; }
.url { position: absolute; right: 44px; bottom: 26px; font-size: 16px; font-weight: 600; letter-spacing: .16em; color: #8b8579; }
.device { position: absolute; left: 628px; top: 92px; width: 640px; transform: perspective(1400px) rotateY(-14deg) rotateX(5deg) rotateZ(-1deg); transform-origin: left center;
  border-radius: 18px; overflow: hidden; border: 1px solid rgba(219,179,92,.34);
  box-shadow: 0 40px 90px rgba(0,0,0,.65), 0 0 0 6px rgba(9,12,11,.9), 0 0 80px rgba(35,160,102,.25); }
.device img { display: block; width: 100%; }
.device::after { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, rgba(255,255,255,.10), transparent 32%); pointer-events: none; }
.rule { position: absolute; left: 0; right: 0; bottom: 0; height: 5px; background: linear-gradient(90deg, #bd954a, #e8c677 45%, #dbb35c 70%, #bd954a); }
</style></head><body>
<div class="light"></div>
<div class="device"><img src="${pathToFileURL(boardFile).href}" alt=""></div>
<div class="copy">
  <div class="lockup"><div class="mark">${MARK_SVG}</div><div class="word">BILLIARD <b>CLUB</b></div></div>
  <h1>${t.headline.replace(/(dasturi|клуба)$/, '<em>$1</em>')}</h1>
  <p class="sub">${t.sub}</p>
</div>
<div class="row"><span class="cta">${t.cta}</span>${t.platforms.map((p) => `<span class="chip">${p}</span>`).join('')}</div>
<div class="url">billiardclub.uz</div>
<div class="rule"></div>
</body></html>`;
};

/**
 * HTML ni PNG ga. Diqqat (Electron 44, offscreen): `backgroundColor` va
 * `zoomFactor` lokal faylni ochishni buzadi, ekran o'lchamidan katta oyna esa
 * qisqartiriladi — shuning uchun to'g'ridan-to'g'ri kerakli o'lchamda chiziladi.
 * Oyna `destroy()` qilinsa, keyingi offscreen oyna sahifa ocholmaydi — oynalar
 * dastur oxirida (app.quit) birga yopiladi.
 */
async function renderHtml(html, width, height, out, transparent = false) {
  const file = path.join(TMP, `render-${Date.now()}.html`);
  fs.writeFileSync(file, html);
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    useContentSize: true,
    transparent,
    webPreferences: { offscreen: true },
  });
  await win.loadFile(file);
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
  await sleep(600);
  const image = await win.webContents.capturePage();
  const size = image.getSize();
  if (size.width !== width || size.height !== height) throw new Error(`kutilgan ${width}×${height}, chiqdi ${size.width}×${size.height}`);
  fs.writeFileSync(out, image.toPNG());
}

async function main() {
  for (const lang of ['uz', 'ru']) {
    const board = await captureBoard(lang);
    const out = path.join(PUBLIC, TEXT[lang].file);
    await renderHtml(bannerHtml(lang, board), 1200, 630, out);
    console.log(`${TEXT[lang].file}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  }

  // Kvadrat logotip (shaffof fon) va favicon.ico
  const logoHtml = `<!doctype html><html><head><style>html,body{margin:0;width:1024px;height:1024px;background:transparent;overflow:hidden}</style></head><body>${MARK_SVG.replace('width="100%" height="100%"', 'width="1024" height="1024"')}</body></html>`;
  const logo = path.join(PUBLIC, 'brand', 'billiardclub-logo-1024.png');
  await renderHtml(logoHtml, 1024, 1024, logo, true);
  run(['-i', logo, '-vf', 'scale=48:48:flags=lanczos', '-c:v', 'png', path.join(PUBLIC, 'favicon.ico')]);
  console.log('billiardclub-logo-1024.png, favicon.ico');
  fs.rmSync(TMP, { recursive: true, force: true });
}

app
  .whenReady()
  .then(main)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
