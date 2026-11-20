/**
 * CSP QO'RIQCHISI. Production nginx `Content-Security-Policy: script-src 'self'` yuboradi
 * (deploy/nginx/billiardclub-security-headers.conf). Sahifadagi ichki (inline) skript,
 * `onclick="…"` kabi atribut yoki `javascript:` havola brauzerda BLOKLANADI va sayt jim
 * buziladi (masalan, mavzu qo'llanmay qoladi). Shuning uchun build (vite-plugin-seo.ts)
 * bunday HTML ni chiqarmaydi — xato bilan to'xtaydi.
 *
 * Ruxsat etilganlar: `src="…"` li skriptlar va JSON-LD (ma'lumot bloki, bajarilmaydi).
 */

const snippet = (text: string): string => `${text.slice(0, 70).replace(/\s+/g, ' ')}…`;

export const cspViolations = (html: string): string[] => {
  const found: string[] = [];
  for (const [tag, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const external = /\bsrc\s*=/i.test(attrs);
    const data = /\btype\s*=\s*["']?application\/ld\+json["']?/i.test(attrs);
    if (!external && !data && body.trim() !== '') found.push(`ichki <script>: ${snippet(tag)}`);
  }
  for (const [tag] of html.matchAll(/<[a-z][^>]*?\son[a-z]+\s*=/gi)) {
    found.push(`hodisa atributi (on…=): ${snippet(tag)}`);
  }
  for (const [tag] of html.matchAll(/<[a-z][^>]*?\s(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/gi)) {
    found.push(`javascript: havola: ${snippet(tag)}`);
  }
  return found;
};
