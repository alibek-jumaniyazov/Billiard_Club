/**
 * Stol hisob-kitobi cheki — 80 mm termoprinter uchun brendlangan maket.
 *
 * Tuzilishi: tepa qator (chapda loyiha logosi, o'ngda billiardclub.uz — kichik)
 * → klub nomi va manzili → chek raqami → o'yin ma'lumotlari → "O'yin", "Bar"
 * bo'limlari → katta JAMI bloki → to'lov va qarz → minnatdorchilik → eng
 * pastda kichik "by billiardclub.uz".
 *
 * Yaxlitlash chekda KO'RSATILMAYDI: stol summasi — kassaga yozilgan summa.
 *
 * Termoprinter kulrang rangni nuqtalab (dither) chiqaradi va matn xiralashadi,
 * shuning uchun BUTUN MATN QORA: urg'u shrift qalinligi, o'lcham, ramka va
 * chiziqlar bilan beriladi. Kenglik foizda (max 80 mm) — 80 mm lenta, 58 mm
 * lenta (@container) va A4/PDF da ham sahifaga sig'adi, kichraytirilmaydi.
 *
 * Bu modul SOF: DOM'ga tegmaydi, faqat HTML qatori quradi (receipt.test.ts).
 * Chop etish — utils/print.ts: printHtml(sarlavha, html, { css: RECEIPT_CSS, fonts: RECEIPT_FONTS }).
 */
import type { TFunction } from 'i18next';
import monoCyrillic from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-cyrillic-wght-normal.woff2?url';
import monoLatin from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url';
import onestCyrillicExt from '@fontsource-variable/onest/files/onest-cyrillic-ext-wght-normal.woff2?url';
import onestCyrillic from '@fontsource-variable/onest/files/onest-cyrillic-wght-normal.woff2?url';
import onestLatinExt from '@fontsource-variable/onest/files/onest-latin-ext-wght-normal.woff2?url';
import onestLatin from '@fontsource-variable/onest/files/onest-latin-wght-normal.woff2?url';
import unboundedCyrillic from '@fontsource-variable/unbounded/files/unbounded-cyrillic-wght-normal.woff2?url';
import unboundedLatin from '@fontsource-variable/unbounded/files/unbounded-latin-wght-normal.woff2?url';
import { SITE_ORIGIN } from '../seo/site';
import type { Order, PaymentMethod } from '../types';
import { formatClock, formatNumber, formatSeconds } from './format';
import { groupOrderItems } from './orders';
import { escapeHtml } from './print';

/* ------------------------------------------------------------------ Ma'lumot */

/** Bar pozitsiyasi: bir mahsulotning jami miqdori */
export interface ReceiptBarLine {
  name: string;
  quantity: number;
  /** Birlik narxi; mahsulot turli narxda qo'shilgan bo'lsa null */
  price: number | null;
  subtotal: number;
}

export interface CheckoutReceiptData {
  /** Klub nomi va manzili (sozlamalardan; telefon chekda chiqmaydi) */
  club: { name: string; address?: string | null };
  /** Chek raqami (sessiya ID). Internetsiz boshlangan o'yinda haqiqiy ID yo'q — null */
  number: number | null;
  table: { number?: number | string | null; name?: string | null } | null;
  startedAt?: string | Date | null;
  endedAt: string | Date;
  durationSeconds: number;
  cashier?: string | null;
  customer?: string | null;
  /** Tarif bo'laklari (narx yoki stol o'zgargan bo'lsa bir nechta) */
  segments?: Array<{ pricePerHour: number; billedSeconds: number; amount: number }> | null;
  /** Kassaga yozilgan stol summasi (yaxlitlash yoqilgan bo'lsa — yaxlit) */
  tableAmount: number;
  /** Bar pozitsiyalari; null — faqat "Bar jami" (oflayn yoki ro'yxat olinmagan) */
  barLines?: ReceiptBarLine[] | null;
  barAmount: number;
  discount: number;
  adjustment?: { amount: number; reason?: string | null } | null;
  total: number;
  paidNow: number;
  payments: Array<{ method: PaymentMethod; amount: number }>;
  debt: number;
  /** Hisob internetsiz saqlangan — server aloqa tiklanganda qayta tekshiradi */
  offline: boolean;
}

/**
 * Bar pozitsiyalari: bekor qilinmagan buyurtmalar mahsulot bo'yicha yig'iladi.
 * Yig'indi yakuniy bar summasiga mos kelmasa — null: chekda noto'g'ri ro'yxat
 * emas, faqat server hisoblagan "Bar jami" qoladi.
 */
export const receiptBarLines = (
  orders: Order[] | null | undefined,
  barAmount: number,
  unknownName: (productId: number) => string,
): ReceiptBarLine[] | null => {
  const items = (orders ?? [])
    .filter((order) => order.status !== 'cancelled')
    .flatMap((order) => order.items ?? []);
  if (items.length === 0) return null;
  const lines = groupOrderItems(items);
  const sum = lines.reduce((acc, line) => acc + line.subtotal, 0);
  if (Math.abs(sum - barAmount) > 0.5) return null;
  return lines.map((line) => ({
    name: line.name || unknownName(line.productId),
    quantity: line.quantity,
    price: line.price,
    subtotal: line.subtotal,
  }));
};

/* ------------------------------------------------------------------ Brend */

/** "billiardclub.uz" — SEO bilan yagona manba */
export const RECEIPT_SITE = new URL(SITE_ORIGIN).host;

/**
 * "B" monogrammasi (favicon.svg / BrandLogo.tsx geometriyasi) — chek varianti.
 * Termoprinter rangni nuqtalab (dither) chiqaradi: o'rtacha tonlar "donador"
 * bo'lib qoladi. Shuning uchun tonlar ikki qutbga surilgan: mato eng to'q zumrad
 * (yorqinligi ~3–5% — qog'ozda yaxlit qora), kiy och oltin va fil suyagi sharlar
 * (~85–100% — qog'ozda oq). Rangli PDF/A4 da brend ranglari saqlanadi.
 * Soya filtri va chiroq yorug'i yo'q (filtr chop etishda xira rastrga aylanadi).
 */
const LOGO_SVG =
  '<svg class="logo" viewBox="0 0 48 48" role="img" aria-label="Billiard Club" xmlns="http://www.w3.org/2000/svg">' +
  '<defs>' +
  '<linearGradient id="rc-felt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#04160e"/><stop offset="1" stop-color="#010a06"/></linearGradient>' +
  '<linearGradient id="rc-cue" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f3dc9c"/><stop offset=".3" stop-color="#fbecc4"/><stop offset=".65" stop-color="#efd590"/><stop offset="1" stop-color="#e6c983"/></linearGradient>' +
  '<radialGradient id="rc-ivory" cx=".31" cy=".29" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#f8f4ea"/><stop offset="1" stop-color="#e2d9c5"/></radialGradient>' +
  '<radialGradient id="rc-spec" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
  '<clipPath id="rc-stem"><rect x="13.6" y="8" width="5" height="32" rx="2.5"/></clipPath>' +
  '</defs>' +
  '<rect x="1" y="1" width="46" height="46" rx="12" fill="url(#rc-felt)"/>' +
  '<rect x="2.8" y="2.8" width="42.4" height="42.4" rx="10.2" fill="none" stroke="#ecd08a" stroke-width=".7"/>' +
  '<rect x="13.6" y="8" width="5" height="32" rx="2.5" fill="url(#rc-cue)"/>' +
  '<g clip-path="url(#rc-stem)"><rect x="13.6" y="8" width="5" height="2.6" fill="#f3eee2"/><rect x="13.6" y="10.6" width="5" height=".6" fill="#010a06"/></g>' +
  '<circle cx="24.9" cy="15.5" r="7.5" fill="url(#rc-ivory)"/>' +
  '<circle cx="25.9" cy="31.5" r="8.5" fill="url(#rc-ivory)"/>' +
  '<circle cx="22.2" cy="12.2" r="1.8" fill="url(#rc-spec)"/>' +
  '<circle cx="22.84" cy="27.76" r="2.04" fill="url(#rc-spec)"/>' +
  '</svg>';

/* ------------------------------------------------------------------ Uslub */

// fontsource bilan bir xil unicode-range: kerakli alifbo fayligina yuklanadi
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const CYRILLIC = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116';
// O'zbek kirill harflari (Ғ, Қ, Ҳ, Ў) — klub, mahsulot va mijoz nomlarida uchraydi
const CYRILLIC_EXT = 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F';

const FONT_TEXT = 'Onest Variable';
const FONT_DISPLAY = 'Unbounded Variable';
const FONT_MONO = 'JetBrains Mono Variable';

const fontFace = (family: string, url: string, weight: string, range: string): string =>
  `@font-face{font-family:'${family}';font-style:normal;font-display:block;font-weight:${weight};` +
  `src:url(${url}) format('woff2');unicode-range:${range}}`;

/**
 * Chop etish iframe'i alohida hujjat — ilovadagi shriftlar unga o'tmaydi.
 * Fayllar ilova yuklagan AYNAN o'sha manzillar (Vite bir xil asset beradi),
 * ya'ni brauzer keshidan darhol olinadi.
 */
const FONT_FACES = [
  fontFace(FONT_TEXT, onestLatin, '100 900', LATIN),
  fontFace(FONT_TEXT, onestLatinExt, '100 900', LATIN_EXT),
  fontFace(FONT_TEXT, onestCyrillic, '100 900', CYRILLIC),
  fontFace(FONT_TEXT, onestCyrillicExt, '100 900', CYRILLIC_EXT),
  fontFace(FONT_DISPLAY, unboundedLatin, '200 900', LATIN),
  fontFace(FONT_DISPLAY, unboundedCyrillic, '200 900', CYRILLIC),
  fontFace(FONT_MONO, monoLatin, '100 800', LATIN),
  fontFace(FONT_MONO, monoCyrillic, '100 800', CYRILLIC),
].join('');

/** printHtml chop etishdan oldin shu shriftlar yuklanishini kutadi */
export const RECEIPT_FONTS = [
  `500 14px "${FONT_TEXT}"`,
  `800 20px "${FONT_DISPLAY}"`,
  `600 14px "${FONT_MONO}"`,
];

const TEXT = `'${FONT_TEXT}','Segoe UI',Roboto,Arial,sans-serif`;
const DISPLAY = `'${FONT_DISPLAY}',${TEXT}`;
const MONO = `'${FONT_MONO}',Consolas,'Courier New',monospace`;

export const RECEIPT_CSS =
  FONT_FACES +
  // Sahifa chekkasi 0: termoprinter lentasining butun kengligi ishlatiladi,
  // brauzer sarlavha/URL kolontitullarini chiqarmaydi; xavfsiz zona — .rc padding.
  // Oraliqlar ixcham: eng to'liq chek ham (ko'chirish, bar, chegirma, qarz) bitta
  // 80×297 mm "sahifa"ga sig'adi — drayver chekni o'rtasidan kesib yubormaydi.
  '@page{size:auto;margin:0}' +
  '*,*::before,*::after{box-sizing:border-box}' +
  'html,body{margin:0;padding:0;background:#fff}' +
  // Konteyner: tor lenta qoidalari SAHIFA kengligiga qarab ishlaydi (@container).
  // @media (max-width) chop etishda oyna kengligi bilan baholanadi — ishonchsiz.
  'body{container-type:inline-size}' +
  `body{color:#000;font-family:${TEXT};font-size:14px;font-weight:500;line-height:1.3;` +
  '-webkit-print-color-adjust:exact;print-color-adjust:exact;text-rendering:geometricPrecision}' +
  '.rc{width:100%;max-width:80mm;margin:0 auto;padding:3.5mm 4mm 6mm}' +
  `.n{font-family:${MONO};font-weight:600;white-space:nowrap}` +
  '.cu{margin-left:.32em;font-size:.86em;font-weight:600}' +
  // Tepa qator: chapda loyiha logosi, o'ngda sayt — kichik, klub nomini bosib ketmaydi
  '.top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:2mm;border-bottom:1.5px solid #000}' +
  '.logo{display:block;flex:none;width:9mm;height:9mm}' +
  '.site{font-size:12px;font-weight:700;letter-spacing:.05em;white-space:nowrap}' +
  // Klub
  '.club{margin-top:3mm;text-align:center}' +
  '.club-name{font-size:19px;font-weight:800;line-height:1.2;letter-spacing:.02em;text-transform:uppercase;overflow-wrap:anywhere}' +
  '.club-meta{margin-top:1px;font-size:12.5px;overflow-wrap:anywhere}' +
  // Chek raqami
  '.ticket{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:3mm 0 2.2mm;padding:5px 10px;' +
  `border:2px solid #000;border-radius:6px;font-family:${DISPLAY};font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}` +
  '.ticket.solo{justify-content:center}' +
  // Qatorlar: chapda yorliq, o'ngda qiymat
  '.r{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:2px 0;break-inside:avoid}' +
  '.r .l{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}' +
  '.r .v{flex:0 0 auto;max-width:64%;text-align:right;white-space:nowrap}' +
  '.meta .v{font-weight:700;white-space:normal;overflow-wrap:anywhere}' +
  '.r.sub{margin-top:5px;font-weight:700}' +
  '.r.sub .n{font-weight:700}' +
  '.r.b{font-size:15.5px;font-weight:800}' +
  '.r.b .n{font-weight:800}' +
  '.r.in{margin:1px 0;padding-left:12px;font-size:13px}' +
  '.r.seg{font-size:13px}' +
  // Bo'lim sarlavhasi: ——— O'YIN ———
  '.sec{display:flex;align-items:center;gap:8px;margin:3.2mm 0 1.4mm;font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;break-after:avoid}' +
  ".sec::before,.sec::after{content:'';flex:1 1 0;border-top:1.5px solid #000}" +
  // Pozitsiya: nom, ostida "miqdor × narx ........ summa"
  '.it{margin:4px 0;break-inside:avoid}' +
  '.it-name{font-weight:700;overflow-wrap:anywhere}' +
  '.it-calc{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding-left:12px;font-size:13px}' +
  '.dash{margin:2.6mm 0 1.6mm;border-top:1.5px dashed #000}' +
  // JAMI: summa sig'masa valyuta keyingi qatorga o'tadi (raqam guruhlari bo'linmaydi)
  '.total{margin:3.6mm 0 1mm;padding:6px 10px 8px;border:2.5px solid #000;border-radius:8px;text-align:center;break-inside:avoid}' +
  '.total-label{font-size:12.5px;font-weight:800;letter-spacing:.22em;text-transform:uppercase}' +
  `.total-amount{margin-top:2px;font-family:${DISPLAY};font-size:28px;font-weight:800;line-height:1.15}` +
  '.total-amount .tn{white-space:nowrap}' +
  `.total-amount small{font-family:${TEXT};font-size:15px;font-weight:700;white-space:nowrap}` +
  '.total-amount.mid{font-size:24px}' +
  '.total-amount.long{font-size:20px}' +
  // Qarz, oflayn belgi
  '.debt{margin:2.5mm 0 0;padding:2px 9px;border:2px dashed #000;border-radius:6px;break-inside:avoid}' +
  '.note{margin:2.5mm 0 0;padding:5px 9px;border:1.5px solid #000;border-radius:6px;text-align:center;font-size:12.5px;font-weight:700;break-inside:avoid}' +
  // Yakun — bir butun blok (sahifa oxirida bo'linib qolmasin)
  '.thanks{margin-top:4.5mm;text-align:center;break-inside:avoid}' +
  '.thanks b{display:block;font-size:16px;font-weight:800}' +
  '.thanks span{display:block;margin-top:1px;font-size:13px}' +
  '.thanks .by{margin-top:3.2mm;font-size:10.5px;font-weight:600;letter-spacing:.06em}' +
  // 58 mm lenta (bosma maydoni ~48 mm): hammasi mutanosib kichrayadi
  '@container (max-width:62mm){.rc{padding:3.5mm 2.5mm 6mm;font-size:12.5px}.logo{width:8mm;height:8mm}.site{font-size:11px}' +
  '.club-name{font-size:16px}.ticket{font-size:12.5px}.r.b{font-size:14px}.r.seg,.it-calc,.r.in{font-size:12px}' +
  '.thanks b{font-size:14.5px}.thanks span{font-size:12px}' +
  '.total-amount{font-size:21px}.total-amount.mid{font-size:18px}.total-amount.long{font-size:15px}' +
  '.total-amount small{font-size:13px}}';

/* ------------------------------------------------------------------ Maket */

const e = escapeHtml;
const pad2 = (n: number) => String(n).padStart(2, '0');
const qtyFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
const round2 = (n: number) => Math.round(n * 100) / 100;

const toDate = (value: string | Date): Date => (value instanceof Date ? value : new Date(value));
const validDate = (value: string | Date | null | undefined): Date | null => {
  if (value == null) return null;
  const d = toDate(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
const formatDay = (d: Date) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "19:10 – 21:40"; yarim tundan o'tgan o'yinda boshlanish kuni bilan: "24.11 23:10 – 01:40" */
const timeRange = (start: Date, end: Date): string => {
  const from = sameDay(start, end)
    ? formatClock(start)
    : `${pad2(start.getDate())}.${pad2(start.getMonth() + 1)} ${formatClock(start)}`;
  return `${from} – ${formatClock(end)}`;
};

/** Raqam monoshriftda (ustunda tekis), valyuta — oddiy matnda */
const money = (amount: number, currency?: string, signed = false): string => {
  const sign = signed && amount > 0 ? '+' : '';
  const cur = currency ? `<span class="cu">${e(currency)}</span>` : '';
  return `<span class="n">${sign}${e(formatNumber(amount))}</span>${cur}`;
};

/** Qator: yorliq (matn — escape qilinadi) va tayyor HTML qiymat (bo'sh — faqat yorliq) */
const row = (label: string, valueHtml: string, cls = ''): string =>
  `<div class="r${cls ? ` ${cls}` : ''}"><span class="l">${e(label)}</span>` +
  (valueHtml ? `<span class="v">${valueHtml}</span>` : '') +
  '</div>';

const section = (title: string): string => `<div class="sec"><span>${e(title)}</span></div>`;

/** Pozitsiya: nom alohida satrda (uzun nom ham sig'adi), ostida hisob va summa */
const item = (name: string, calcHtml: string, amountHtml: string): string =>
  `<div class="it"><div class="it-name">${e(name)}</div>` +
  `<div class="it-calc"><span>${calcHtml}</span><span>${amountHtml}</span></div></div>`;

const tableLabel = (table: NonNullable<CheckoutReceiptData['table']>): string => {
  const num = table.number != null && String(table.number).trim() !== '' ? `№${table.number}` : '';
  const name = table.name?.trim() ?? '';
  return [num, name].filter(Boolean).join(' · ') || '—';
};

/** Katta summa: uzunligiga qarab shrift kichrayadi — lentadan chiqib ketmasin */
const totalSizeClass = (text: string): string => (text.length > 11 ? ' long' : text.length > 9 ? ' mid' : '');

/**
 * Chek tanasi (body ichidagi HTML). Barcha o'zgaruvchan matn escape qilinadi:
 * klub, mahsulot, mijoz nomlari va tuzatish sababi foydalanuvchi kiritgan matn.
 */
export const renderCheckoutReceipt = (d: CheckoutReceiptData, t: TFunction, currency: string): string => {
  const out: string[] = ['<main class="rc">'];

  // 1. Tepa qator: chapda loyiha logosi, o'ngda sayt manzili (kichik)
  out.push(`<header class="top">${LOGO_SVG}<span class="site">${e(RECEIPT_SITE)}</span></header>`);

  // 2. Klub nomi va manzili (sozlamalardagi manzil — kiritilgan bo'lsa)
  const clubName = d.club.name.trim();
  const address = d.club.address?.trim();
  if (clubName || address) {
    out.push('<section class="club">');
    if (clubName) out.push(`<div class="club-name">${e(clubName)}</div>`);
    if (address) out.push(`<div class="club-meta">${e(address)}</div>`);
    out.push('</section>');
  }

  // 3. Chek raqami
  const label = `<span>${e(t('tables.receipt'))}</span>`;
  out.push(
    d.number != null && d.number > 0
      ? `<div class="ticket">${label}<span>№ ${d.number}</span></div>`
      : `<div class="ticket solo">${label}</div>`,
  );

  // 4. O'yin ma'lumotlari
  const ended = validDate(d.endedAt) ?? new Date();
  const started = validDate(d.startedAt);
  out.push('<section class="meta">');
  out.push(row(t('common.date'), e(formatDay(ended))));
  if (d.table) out.push(row(t('common.table'), e(tableLabel(d.table))));
  if (started) out.push(row(t('tables.rcptTime'), e(timeRange(started, ended))));
  out.push(row(t('common.duration'), `<span class="n">${e(formatSeconds(d.durationSeconds))}</span>`));
  if (d.cashier?.trim()) out.push(row(t('tables.rcptCashier'), e(d.cashier.trim())));
  if (d.customer?.trim()) out.push(row(t('common.customer'), e(d.customer.trim())));
  out.push('</section>');

  // 5. O'yin: tarif (narx/soat × vaqt) va stol summasi. Yaxlitlash chekda
  // ko'rsatilmaydi — mijoz kassaga yozilgan summani ko'radi. Bo'laklar summasi
  // faqat ular stol summasini AYNAN tashkil qilsa chiqadi (bir nechta bo'lak,
  // yaxlitlashsiz) — aks holda aniq summalar yaxlit jamiga mos kelmay qolardi.
  out.push(section(t('tables.rcptSectionGame')));
  const segments = d.segments ?? [];
  const segmentsSum = segments.reduce((acc, seg) => acc + seg.amount, 0);
  const segmentAmounts = segments.length > 1 && Math.abs(segmentsSum - d.tableAmount) < 0.5;
  for (const seg of segments) {
    const rate = `${formatNumber(seg.pricePerHour)} ${currency}/${t('common.hours')}`;
    out.push(row(`${rate} × ${formatSeconds(seg.billedSeconds)}`, segmentAmounts ? money(seg.amount) : '', 'seg'));
  }
  out.push(row(t('tables.tableAmount'), money(d.tableAmount, currency), 'sub'));

  // 6. Bar: pozitsiyalar (bo'lsa) va jami
  const barLines = d.barLines ?? [];
  if (d.barAmount > 0 || barLines.length > 0) {
    out.push(section(t('tables.rcptSectionBar')));
    for (const line of barLines) {
      const calc =
        line.price != null
          ? `${qtyFormat.format(line.quantity)} × ${formatNumber(line.price)}`
          : `× ${qtyFormat.format(line.quantity)}`;
      out.push(item(line.name, `<span class="n">${e(calc)}</span>`, money(line.subtotal)));
    }
    out.push(row(t('tables.rcptBarTotal'), money(d.barAmount, currency), 'sub'));
  }

  // 7. Chegirma va qo'lda tuzatish — oraliq jami bilan (arifmetika chekda ko'rinsin)
  const adjustment = d.adjustment && d.adjustment.amount !== 0 ? d.adjustment : null;
  if (d.discount > 0 || adjustment) {
    out.push('<div class="dash"></div>');
    out.push(row(t('tables.rcptSubtotal'), money(round2(d.tableAmount + d.barAmount), currency)));
    if (d.discount > 0) out.push(row(t('common.discount'), money(-d.discount, currency)));
    if (adjustment) {
      const reason = adjustment.reason?.trim();
      out.push(
        row(`${t('tables.adjustment')}${reason ? ` (${reason})` : ''}`, money(adjustment.amount, currency, true)),
      );
    }
  }

  // 8. JAMI — chekning eng ko'zga tashlanadigan qismi
  const totalText = formatNumber(d.total);
  out.push(
    `<div class="total"><div class="total-label">${e(t('tables.rcptTotal'))}</div>` +
      `<div class="total-amount${totalSizeClass(totalText)}"><span class="tn">${e(totalText)}</span> <small>${e(currency)}</small></div></div>`,
  );

  // 9. To'lov: bitta usul — yorliqda; bir nechta — har biri alohida satrda
  out.push(section(t('tables.rcptSectionPayment')));
  const paid = d.payments.filter((p) => p.amount > 0);
  const paidLabel =
    paid.length === 1 ? `${t('tables.rcptPaid')} · ${t(`payment.${paid[0].method}`)}` : t('tables.rcptPaid');
  out.push(row(paidLabel, money(d.paidNow, currency), 'b'));
  if (paid.length > 1) {
    for (const p of paid) out.push(row(t(`payment.${p.method}`), money(p.amount, currency), 'in'));
  }
  if (d.debt > 0) out.push(`<div class="debt">${row(t('tables.debtAmount'), money(d.debt, currency), 'b')}</div>`);
  if (d.offline) out.push(`<div class="note">${e(t('offline.checkoutOfflineReceipt'))}</div>`);

  // 10. Minnatdorchilik, eng pastda kichik "by billiardclub.uz"
  out.push(
    `<footer class="thanks"><b>${e(t('tables.rcptThanks'))}</b><span>${e(t('tables.rcptComeBack'))}</span>` +
      `<div class="by">by ${e(RECEIPT_SITE)}</div></footer>`,
  );
  out.push('</main>');
  return out.join('');
};
