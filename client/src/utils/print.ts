/**
 * Chek / Z-hisobot chop etish. Yashirin iframe ishlatiladi: popup
 * bloklovchilarga chidamli va joriy sahifa holatiga tegmaydi.
 *
 * Standart uslub — tor monospace maket (Z-hisobot). Stol cheki o'z uslubi va
 * brend shriftlari bilan chiqadi: utils/receipt.ts (RECEIPT_CSS, RECEIPT_FONTS).
 */

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
  );

/** Chek qatori: chapda yorliq, o'ngda qiymat (bold — yakun qatorlari) */
export const receiptRow = (label: string, value: string, bold = false): string =>
  `<div class="r${bold ? ' b' : ''}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;

/** 80 mm termoprinterga mos tor monospace maket (Z/X-hisobot) */
const DEFAULT_CSS =
  `body{font-family:'Consolas',monospace;font-size:12px;color:#000;margin:0;padding:12px;max-width:300px}` +
  `h1{font-size:14px;text-align:center;margin:0 0 4px}` +
  `h2{font-size:12px;margin:8px 0 2px}` +
  `.c{text-align:center;margin:0 0 8px}` +
  `.r{display:flex;justify-content:space-between;gap:8px;margin:2px 0}` +
  `.b{font-weight:700}hr{border:none;border-top:1px dashed #000;margin:6px 0}`;

export interface PrintOptions {
  /** Hujjat uslubi; berilmasa — standart tor monospace maket */
  css?: string;
  /**
   * Chop etishdan oldin yuklanishi kutiladigan shriftlar (CSS `font`
   * qisqartmasi, masalan `800 20px "Unbounded Variable"`). Iframe alohida
   * hujjat: kutilmasa birinchi chek zaxira shriftda chiqib qolardi.
   */
  fonts?: string[];
  /** <html lang> — tirnoq va bo'g'in ko'chirish qoidalari uchun */
  lang?: string;
}

/** Shrift kutish chegarasi: fayl kelmasa ham chek baribir chiqadi (zaxira shriftda) */
const FONT_WAIT_MS = 2500;

const waitForFonts = async (doc: Document, fonts: string[]): Promise<void> => {
  const set = doc.fonts;
  if (!set || fonts.length === 0) return;
  // Matndagi belgilar bo'yicha — kerakli alifbo (lotin/kirill) fayllari yuklanadi
  const sample = doc.body?.textContent ?? '';
  const loaded = Promise.all(fonts.map((font) => set.load(font, sample).catch(() => []))).then(() => set.ready);
  await Promise.race([loaded, new Promise<void>((resolve) => window.setTimeout(resolve, FONT_WAIT_MS))]);
};

export const printHtml = (title: string, bodyHtml: string, options: PrintOptions = {}) => {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }
  const lang = options.lang ? ` lang="${escapeHtml(options.lang)}"` : '';
  doc.open();
  doc.write(
    `<!doctype html><html${lang}><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>${options.css ?? DEFAULT_CSS}</style>` +
      `</head><body>${bodyHtml}</body></html>`,
  );
  doc.close();

  const print = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 2000);
  };
  if (options.fonts?.length) {
    void waitForFonts(doc, options.fonts).then(print, print);
  } else {
    print();
  }
};
