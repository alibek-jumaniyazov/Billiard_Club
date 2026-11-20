/*
 * Erta mavzu skripti — index.html <head> ida, CSS va React'dan OLDIN, sinxron yuklanadi:
 *  - <html> ga `js` klassi qo'shiladi (qidiruv botlari uchun statik matn #seo-static yashiriladi);
 *  - tanlangan rejim (och/qorong'i) darhol qo'llanadi — sahifa noto'g'ri rangda "chaqnab" qolmaydi.
 *
 * Nega alohida fayl, ichki (inline) <script> emas: production'da Content-Security-Policy
 * `script-src 'self'` (deploy/nginx/billiardclub-security-headers.conf) — ichki skriptlar
 * brauzerda bloklanadi. Kalit AppSettingsContext THEME_KEY bilan bir xil ('bc.theme'),
 * ranglar — PALETTES[rejim].themeColor (src/theme/tokens.ts).
 */
(function () {
  var d = document.documentElement;
  d.classList.add('js');
  var mode = 'light';
  try {
    if (localStorage.getItem('bc.theme') === 'dark') mode = 'dark';
  } catch (e) {
    /* localStorage taqiqlangan (maxfiy rejim) — och rejim qoladi */
  }
  d.setAttribute('data-theme', mode);
  d.style.colorScheme = mode;
  d.style.background = mode === 'dark' ? '#0b0d0c' : '#f3efe6';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#0b0d0c' : '#f3efe6');
})();
