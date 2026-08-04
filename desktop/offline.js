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
    background: radial-gradient(1200px 600px at 50% -10%, #17251f 0%, #0e1513 60%);
    color: #eef2f0; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    padding: 24px;
  }
  .card {
    max-width: 520px; width: 100%; text-align: center;
    background: rgba(28,38,34,.72); border: 1px solid #2e3b35; border-radius: 18px;
    padding: 40px 32px; box-shadow: 0 24px 60px rgba(0,0,0,.45);
  }
  .mark {
    width: 56px; height: 56px; margin: 0 auto 20px; border-radius: 16px;
    background: linear-gradient(135deg,#e2c358 0%,#d4af37 45%,#b5922c 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 28px; color: #141210;
  }
  h1 { margin: 0 0 10px; font-size: 22px; font-weight: 650; letter-spacing: -.01em }
  p { margin: 0 0 8px; color: #b3bfb8; line-height: 1.6; font-size: 14px }
  code { color: #d4af37; font-size: 12px; word-break: break-all }
  .actions { margin-top: 26px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap }
  button {
    font: inherit; font-weight: 600; padding: 10px 22px; border-radius: 10px; cursor: pointer;
    border: 1px solid #3d4c44; background: transparent; color: #eef2f0; transition: .15s;
  }
  button:hover { background: #243029 }
  button.primary { background: #d4af37; border-color: #d4af37; color: #141210 }
  button.primary:hover { background: #e2c358 }
  .hint { margin-top: 22px; font-size: 12.5px; color: #7d8a83 }
</style>
</head>
<body>
  <div class="card">
    <div class="mark">◆</div>
    <h1>Serverga ulanib bo'lmadi</h1>
    <p>Internet aloqasini tekshiring va qayta urinib ko'ring.</p>
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
</body>
</html>`;

module.exports = { offlineFallbackHtml };
