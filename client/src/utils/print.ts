/**
 * Chek / Z-hisobot chop etish — 80 mm termoprinterga mos tor monospace maket.
 * Yashirin iframe ishlatiladi: popup bloklovchilarga chidamli va joriy
 * sahifa holatiga tegmaydi.
 */

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
  );

/** Chek qatori: chapda yorliq, o'ngda qiymat (bold — yakun qatorlari) */
export const receiptRow = (label: string, value: string, bold = false): string =>
  `<div class="r${bold ? ' b' : ''}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;

export const printHtml = (title: string, bodyHtml: string) => {
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
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>body{font-family:'Consolas',monospace;font-size:12px;color:#000;margin:0;padding:12px;max-width:300px}` +
      `h1{font-size:14px;text-align:center;margin:0 0 4px}` +
      `h2{font-size:12px;margin:8px 0 2px}` +
      `.c{text-align:center;margin:0 0 8px}` +
      `.r{display:flex;justify-content:space-between;gap:8px;margin:2px 0}` +
      `.b{font-weight:700}hr{border:none;border-top:1px dashed #000;margin:6px 0}</style>` +
      `</head><body>${bodyHtml}</body></html>`,
  );
  doc.close();
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  window.setTimeout(() => frame.remove(), 2000);
};
