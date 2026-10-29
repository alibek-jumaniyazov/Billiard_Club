/**
 * ZAXIRA EKRAN — ilova umuman yuklanmaganda ko'rsatiladi.
 *
 * Bu holat FAQAT bir marta uchraydi: dastur birinchi marta ochilayotgan
 * bo'lsa va internet yo'q bo'lsa (service worker hali o'rnatilmagan).
 * Bir marta internet bilan ochilgandan keyin ilova oflayn ham to'g'ridan-to'g'ri
 * ochiladi va bu ekran boshqa chiqmaydi.
 *
 * Ataylab: bu yerda tashqi fayl, shrift yoki rasm YO'Q — internet bo'lmagan
 * holat uchun mo'ljallangan ekran o'zi tarmoqqa bog'liq bo'lmasligi kerak.
 */

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * HTML ATRIBUTI ICHIDAGI JS satri uchun xavfsiz qiymat.
 *
 * `onclick="location.replace(...)"` — bu ikki qatlamli kontekst: avval HTML
 * atribut tahlil qilinadi, so'ng ichidagi JS. Faqat `JSON.stringify` yetarli
 * emas: u qo'shtirnoqni JS uchun ekranlaydi, lekin HTML atribut chegarasini
 * emas — natijada `"><script>` ko'rinishidagi manzil atributdan chiqib
 * ketardi. Shuning uchun JSON natijasi ustidan HTML ekranlash ham qo'llanadi
 * (brauzer atribut qiymatidagi entity'larni JS ga uzatishdan OLDIN ochadi).
 */
const jsStringInAttr = (value) => escapeHtml(JSON.stringify(String(value ?? '')));

/** <script> ichidagi JS satri: `</script>` va HTML izohlari uzib qo'ymasin */
const jsStringInScript = (value) =>
  JSON.stringify(String(value ?? '')).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

/** Brend belgisi ("B" monogrammasi) — favicon.svg bilan bir xil, tashqi faylsiz */
const MARK_SVG = `<svg width="64" height="64" viewBox="0 0 48 48" aria-hidden="true">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#18774c"/><stop offset="1" stop-color="#08261a"/></linearGradient>
    <linearGradient id="c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e8c677"/><stop offset=".3" stop-color="#f5dfa6"/><stop offset=".65" stop-color="#dbb35c"/><stop offset="1" stop-color="#bd954a"/></linearGradient>
    <radialGradient id="i" cx=".31" cy=".29" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".42" stop-color="#f3eee2"/><stop offset="1" stop-color="#c4b9a2"/></radialGradient>
  </defs>
  <rect x="1" y="1" width="46" height="46" rx="12" fill="url(#f)"/>
  <rect x="2.8" y="2.8" width="42.4" height="42.4" rx="10.2" fill="none" stroke="#dbb35c" stroke-opacity=".75" stroke-width=".6"/>
  <rect x="13.6" y="8" width="5" height="32" rx="2.5" fill="url(#c)"/>
  <circle cx="24.9" cy="15.5" r="7.5" fill="url(#i)"/>
  <circle cx="25.9" cy="31.5" r="8.5" fill="url(#i)"/>
</svg>`;

/** Avtomatik qayta urinish oralig'i — internet qaytsa `online` hodisasi bundan oldin ishlaydi */
const RETRY_SECONDS = 15;

const offlineFallbackHtml = ({ url, reason }) => `<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Billiard Club — ulanib bo'lmadi</title>
<style>
  :root { color-scheme: dark }
  * { box-sizing: border-box }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: radial-gradient(900px 520px at 50% -12%, rgba(24,119,76,.22) 0%, transparent 70%), #090c0b;
    color: #f1ece1; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    padding: 24px;
  }
  .card {
    max-width: 520px; width: 100%; text-align: center;
    background: #101513; border: 1px solid #24302a; border-radius: 18px;
    padding: 40px 32px; box-shadow: 0 24px 60px rgba(0,0,0,.45);
  }
  .mark { margin: 0 auto 20px; width: 64px; height: 64px }
  .wifi { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 14px; padding: 5px 12px;
    border-radius: 999px; background: rgba(240,165,58,.12); color: #f0a53a; font-size: 12.5px; font-weight: 600 }
  .wifi i { width: 7px; height: 7px; border-radius: 50%; background: #f0a53a; animation: pulse 1.6s ease-in-out infinite }
  @keyframes pulse { 50% { opacity: .35 } }
  h1 { margin: 0 0 10px; font-size: 22px; font-weight: 650; letter-spacing: -.01em }
  p { margin: 0 0 8px; color: #b5ae9f; line-height: 1.6; font-size: 14px }
  code { color: #dbb35c; font-size: 12px; word-break: break-all }
  .actions { margin-top: 26px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap }
  button {
    font: inherit; font-weight: 600; padding: 10px 22px; border-radius: 10px; cursor: pointer;
    border: 1px solid #33413a; background: transparent; color: #f1ece1; transition: .15s;
  }
  button:hover { background: #1d2622 }
  button.primary { background: #dbb35c; border-color: #dbb35c; color: #17130a }
  button.primary:hover { background: #e8c677 }
  .hint { margin-top: 22px; font-size: 12.5px; color: #8b8579 }
  @media (prefers-reduced-motion: reduce) { .wifi i { animation: none } }
</style>
</head>
<body>
  <div class="card">
    <div class="mark">${MARK_SVG}</div>
    <div class="wifi"><i></i><span id="status">Internet yo'q — qayta ulanish kutilmoqda</span></div>
    <h1>Serverga ulanib bo'lmadi</h1>
    <p>Internet qaytishi bilan dastur o'zi ochiladi. Hozir qo'lda ham urinib ko'rishingiz mumkin.</p>
    <p><code>${escapeHtml(url)}</code></p>
    <div class="actions">
      <button class="primary" onclick="location.replace(${jsStringInAttr(url)})">
        Qayta urinish
      </button>
      <button onclick="location.reload()">Yangilash</button>
    </div>
    <p class="hint">
      Dastur bir marta internet bilan ochilgandan so'ng, keyingi safar internetsiz ham ishlaydi.
      ${reason ? `<br><span style="opacity:.7">(${escapeHtml(reason)})</span>` : ''}
    </p>
  </div>
  <script>
    (function () {
      var target = ${jsStringInScript(url)};
      var left = ${RETRY_SECONDS};
      var status = document.getElementById('status');
      var go = function () { location.replace(target); };
      // Internet qaytdi — darhol ochamiz
      window.addEventListener('online', go);
      setInterval(function () {
        left -= 1;
        if (left <= 0) { go(); return; }
        status.textContent = "Internet yo'q — " + left + ' soniyadan keyin qayta urinamiz';
      }, 1000);
    })();
  </script>
</body>
</html>`;

module.exports = { offlineFallbackHtml };
