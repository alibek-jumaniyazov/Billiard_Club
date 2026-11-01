// BILLIARD CLUB — ijtimoiy tarmoq / qidiruv bannerlari (va ixtiyoriy ravishda ikonkalar).
//
// Landingning yangi uslubi: fil suyagi qog'oz fon, vazmin Onest sarlavha (hero
// shiori), logotip o'zgarmagan holda, o'ngda — saytdagi HAQIQIY billiard stoli
// (canvas suratga olinadi) va stol tablosi:
//   client/public/og-cover.png      1200×630, o'zbekcha (Google, Telegram, Facebook havola ko'rinishi)
//   client/public/og-cover-ru.png   1200×630, ruscha
// --icons bilan qo'shimcha (logotip o'zgarganda; ffmpeg kerak):
//   client/public/favicon.ico       48×48 (qidiruv natijasidagi ikonka, eski brauzerlar)
//   client/public/brand/billiardclub-logo-1024.png  kvadrat logotip (Google Business, kataloglar)
//
//   desktop/node_modules/.bin/electron tools/brand-video/banners.cjs --url=http://localhost:5173
//   ... --icons --ffmpeg=…
//
// --url — landing ochiladigan manzil (dev server yoki https://billiardclub.uz).
// Matnlar (shior, ustki yozuv) saytning o'z tarjimalaridan olinadi:
// client/src/i18n/pages/landing.ts — banner sayt bilan doim bir xil.
// Rasm yangilansa client/src/seo/site.ts dagi OG_VERSION ni oshiring — Telegram va
// Facebook eski rasmni keshdan ko'rsatmasin.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const flags = new Set(process.argv.filter((a) => a.startsWith('--') && !a.includes('=')).map((a) => a.slice(2)));
const args = Object.fromEntries(
  process.argv
    .filter((a) => a.startsWith('--') && a.includes('='))
    .map((a) => {
      const [k, ...v] = a.slice(2).split('=');
      return [k, v.join('=')];
    }),
);
const ROOT = path.resolve(__dirname, '..', '..');
const CLIENT = path.join(ROOT, 'client');
const PUBLIC = path.join(CLIENT, 'public');
const SITE = (args.url || 'http://localhost:5173').replace(/\/+$/, '');
const FFMPEG = args.ffmpeg || process.env.FFMPEG_PATH || 'ffmpeg';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-banners-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const font = (rel) => pathToFileURL(path.join(CLIENT, 'node_modules', '@fontsource-variable', rel)).href;
const MARK_SVG = fs
  .readFileSync(path.join(PUBLIC, 'favicon.svg'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/width="48" height="48"/, 'width="100%" height="100%"');

/** Landing tarjimalari — TS fayl esbuild bilan CommonJS ga aylantirib o'qiladi */
const loadLanding = () => {
  const esbuild = require(path.join(CLIENT, 'node_modules', 'esbuild'));
  const out = path.join(TMP, 'landing-i18n.cjs');
  esbuild.buildSync({
    entryPoints: [path.join(CLIENT, 'src', 'i18n', 'pages', 'landing.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: out,
    logLevel: 'silent',
  });
  const mod = require(out);
  return mod.default || mod;
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "Billiard klubingiz — to'liq nazoratda" → [to'q satr, xira satr] (Hero.tsx bilan bir xil) */
const splitTitle = (title) => {
  const i = title.indexOf(' — ');
  return i > 0 ? [title.slice(0, i), title.slice(i + 3)] : [title, ''];
};

const TEXT = {
  uz: {
    path: '/',
    file: 'og-cover.png',
    sub: 'Stol taymeri · Bar va kassa · Qarzlar · Hisobotlar',
    platforms: ['Windows', 'Android', 'Brauzer'],
    cta: '7 kun bepul',
    sum: "so'm",
    titleSize: 60,
  },
  ru: {
    path: '/ru/',
    file: 'og-cover-ru.png',
    sub: 'Таймер столов · Бар и касса · Долги · Отчёты',
    platforms: ['Windows', 'Android', 'Браузер'],
    cta: '7 дней бесплатно',
    sum: 'сум',
    titleSize: 50,
  },
};

const run = (argv) => {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg ${argv.join(' ')}`);
};

/**
 * Landingdagi billiard stoli — "harakatni kamaytirish" rejimida: sahna
 * yopishqoq emas, stol tekis turadi, piramida terilgan, ustidagi yozuv va
 * tugmalar yo'q. Faqat canvas o'rami suratga olinadi.
 */
async function captureTable(lang) {
  const ses = session.fromPartition(`banner-${lang}-${Date.now()}`);
  const preload = path.join(TMP, `preload-${lang}.js`);
  fs.writeFileSync(preload, "try { sessionStorage.setItem('bc.intro.v1', '1'); localStorage.setItem('bc.theme', 'light'); } catch (e) {}");
  const win = new BrowserWindow({
    width: 1440,
    height: 1000,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true, session: ses, preload, sandbox: false, contextIsolation: false },
  });
  const wc = win.webContents;
  // Debugger faqat sahifasi bor oynaga ulanadi — avval bo'sh sahifa
  await win.loadURL('about:blank');
  wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await win.loadURL(`${SITE}${TEXT[lang].path}`);
  await sleep(2500);
  const rect = await wc.executeJavaScript(`(async () => {
    const style = document.createElement('style');
    style.textContent = '.lp-hero-cards, .bt-rail, .bt-hint, .bt-toast { display: none !important; }';
    document.head.appendChild(style);
    const el = document.querySelector('.bt-root');
    if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 1800));
    const r = el.getBoundingClientRect();
    return { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) };
  })()`);
  if (!rect) throw new Error(`.bt-root topilmadi: ${SITE}${TEXT[lang].path}`);
  const file = path.join(TMP, `table-${lang}.png`);
  fs.writeFileSync(file, (await wc.capturePage(rect)).toPNG());
  return file;
}

const bannerHtml = (lang, tableFile, copy) => {
  const t = TEXT[lang];
  const [lead, tail] = splitTitle(copy.heroTitle);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
@font-face { font-family: 'Onest'; src: url("${font('onest/files/onest-latin-wght-normal.woff2')}") format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Onest'; src: url("${font('onest/files/onest-cyrillic-wght-normal.woff2')}") format('woff2'); font-weight: 100 900; unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: 'Unbounded'; src: url("${font('unbounded/files/unbounded-latin-wght-normal.woff2')}") format('woff2'); font-weight: 200 900; }
@font-face { font-family: 'Unbounded'; src: url("${font('unbounded/files/unbounded-cyrillic-wght-normal.woff2')}") format('woff2'); font-weight: 200 900; unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: 'JetBrains Mono'; src: url("${font('jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2')}") format('woff2'); font-weight: 100 800; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; background: #f3efe6; }
body { position: relative; font-family: 'Onest', sans-serif; color: #17140f; -webkit-font-smoothing: antialiased; }
/* Qog'oz fon: yuqoridan yumshoq yorug', o'ngda stol ustidagi iliq lampa nuri */
.paper { position: absolute; inset: 0;
  background:
    radial-gradient(760px 420px at 76% 30%, rgba(255, 236, 196, .55), transparent 70%),
    radial-gradient(900px 520px at 30% -10%, rgba(255, 255, 255, .8), transparent 70%),
    radial-gradient(700px 420px at 90% 105%, rgba(15, 77, 58, .10), transparent 70%); }
.copy { position: absolute; left: 64px; top: 56px; width: 560px; }
.lockup { display: flex; align-items: center; gap: 14px; }
.mark { width: 54px; height: 54px; filter: drop-shadow(0 8px 16px rgba(23, 20, 15, .18)); }
.word { font-family: 'Unbounded'; font-weight: 700; font-size: 20px; letter-spacing: .08em; color: #17140f; }
.word b { color: #8c6a33; font-weight: 700; }
.eyebrow { margin-top: 46px; font-family: 'Unbounded'; font-weight: 600; font-size: 12.5px; letter-spacing: .16em; text-transform: uppercase; color: #8c6a33; }
h1 { margin-top: 16px; font-weight: 650; font-size: ${t.titleSize}px; line-height: 1.02; letter-spacing: -.045em; }
h1 span, h1 em { display: block; }
h1 em { font-style: normal; color: #8a8172; }
.sub { margin-top: 22px; font-size: 20px; line-height: 1.5; font-weight: 500; color: #4d473d; }
.row { position: absolute; left: 64px; bottom: 56px; display: flex; align-items: center; gap: 10px; }
.cta { padding: 13px 24px; border-radius: 999px; background: #0f4d3a; color: #f7f3ea; font-weight: 650; font-size: 19px; box-shadow: 0 12px 26px rgba(15, 77, 58, .28); }
.chip { padding: 10px 16px; border-radius: 999px; border: 1px solid rgba(23, 20, 15, .13); background: #fbf8f2; color: #4d473d; font-weight: 600; font-size: 15px; }
.url { position: absolute; right: 48px; bottom: 30px; font-size: 15px; font-weight: 600; letter-spacing: .14em; color: #7c7466; }
/* Stol: haqiqiy canvas surati, ozgina perspektivada — hero'dagidek */
.table { position: absolute; left: 606px; top: 98px; width: 546px;
  transform: perspective(1700px) rotateY(-15deg) rotateX(9deg) rotateZ(-1.5deg); transform-origin: left center; }
.table img { display: block; width: 100%; border-radius: 14px;
  box-shadow: 0 46px 80px rgba(23, 20, 15, .34), 0 16px 28px rgba(23, 20, 15, .2); }
/* Stol tablosi — kassada ko'rinadigan narsa: stol, jonli vaqt va summa */
.board { position: absolute; left: 650px; top: 444px; display: flex; align-items: center; gap: 24px; padding: 13px 22px;
  border: 1px solid rgba(23, 20, 15, .1); border-radius: 16px; background: linear-gradient(180deg, #fffdf9, #f6f1e7);
  box-shadow: 0 1px 0 rgba(255, 255, 255, .9) inset, 0 22px 40px rgba(23, 20, 15, .16);
  font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
.board i { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; font-style: normal;
  font-family: 'Onest'; font-weight: 700; font-size: 13px; color: #1a1712;
  background: radial-gradient(circle at 32% 28%, #fff6cf 0%, #e9c457 34%, #a8801f 100%); }
.board .tag { display: inline-flex; align-items: center; gap: 9px; font-size: 13px; font-weight: 700; letter-spacing: .12em; color: #4d473d; }
.board .time { font-size: 27px; font-weight: 600; color: #17140f; }
.board .sum { font-size: 21px; font-weight: 600; color: #8c6a33; }
.board .sum small { margin-left: 5px; font-family: 'Onest'; font-size: 13px; font-weight: 500; color: #7c7466; }
</style></head><body>
<div class="paper"></div>
<div class="table"><img src="${pathToFileURL(tableFile).href}" alt=""></div>
<div class="board"><span class="tag"><i>7</i>VIP</span><span class="time">00:47:21</span><span class="sum">47 400<small>${esc(t.sum)}</small></span></div>
<div class="copy">
  <div class="lockup"><div class="mark">${MARK_SVG}</div><div class="word">BILLIARD <b>CLUB</b></div></div>
  <div class="eyebrow">${esc(copy.heroBadge)}</div>
  <h1><span>${esc(lead)}</span>${tail ? `<em>${esc(tail)}</em>` : ''}</h1>
  <p class="sub">${esc(t.sub)}</p>
</div>
<div class="row"><span class="cta">${esc(t.cta)}</span>${t.platforms.map((p) => `<span class="chip">${esc(p)}</span>`).join('')}</div>
<div class="url">billiardclub.uz</div>
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
  const landing = loadLanding();
  for (const lang of ['uz', 'ru']) {
    const table = await captureTable(lang);
    const out = path.join(PUBLIC, TEXT[lang].file);
    await renderHtml(bannerHtml(lang, table, landing[lang]), 1200, 630, out);
    console.log(`${TEXT[lang].file}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  }

  // Kvadrat logotip (shaffof fon) va favicon.ico — faqat --icons bilan (logotip o'zgarganda)
  if (flags.has('icons')) {
    const logoHtml = `<!doctype html><html><head><style>html,body{margin:0;width:1024px;height:1024px;background:transparent;overflow:hidden}</style></head><body>${MARK_SVG.replace('width="100%" height="100%"', 'width="1024" height="1024"')}</body></html>`;
    const logo = path.join(PUBLIC, 'brand', 'billiardclub-logo-1024.png');
    await renderHtml(logoHtml, 1024, 1024, logo, true);
    run(['-i', logo, '-vf', 'scale=48:48:flags=lanczos', '-c:v', 'png', path.join(PUBLIC, 'favicon.ico')]);
    console.log('billiardclub-logo-1024.png, favicon.ico');
  }
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
