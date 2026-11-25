import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import common from '../i18n/common';
import offline from '../i18n/pages/offline';
import orders from '../i18n/pages/orders';
import tables from '../i18n/pages/tables';
import type { Order, OrderItem } from '../types';
import { formatNumber } from './format';
import {
  RECEIPT_CSS,
  RECEIPT_FONTS,
  RECEIPT_SITE,
  receiptBarLines,
  renderCheckoutReceipt,
  type CheckoutReceiptData,
} from './receipt';

/** Haqiqiy lug'atlardan tarjimon: kalit topilmasa — test yiqiladi (xom kalit chekka chiqmasin) */
const translator = (lang: 'uz' | 'ru'): TFunction => {
  const dict: Record<string, string> = { ...common[lang] };
  const pages: Record<string, { uz: Record<string, string>; ru: Record<string, string> }> = { tables, offline, orders };
  for (const [ns, page] of Object.entries(pages)) {
    for (const [key, value] of Object.entries(page[lang])) dict[`${ns}.${key}`] = value;
  }
  const t = (key: string, options?: Record<string, unknown>) => {
    const template = dict[key];
    if (template === undefined) throw new Error(`Tarjima yo'q: ${key}`);
    return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name] ?? ''));
  };
  return t as unknown as TFunction;
};

const uz = translator('uz');
const ru = translator('ru');
/** formatNumber guruhlarni NBSP bilan ajratadi — textOf bo'shliqlarni oddiy probelga keltiradi */
const money = (n: number) => formatNumber(n).replace(/\s/g, ' ');

const local = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString();

const base = (over: Partial<CheckoutReceiptData> = {}): CheckoutReceiptData => ({
  club: { name: 'Prime Billiard', address: 'Toshkent, Chilonzor 12' },
  number: 1234,
  table: { number: 3, name: 'VIP' },
  startedAt: local(2026, 11, 25, 19, 10),
  endedAt: local(2026, 11, 25, 21, 40),
  durationSeconds: 9000,
  cashier: 'Aziz',
  customer: null,
  segments: [{ pricePerHour: 40000, billedSeconds: 9000, amount: 100000 }],
  tableAmount: 100000,
  barLines: null,
  barAmount: 0,
  discount: 0,
  adjustment: null,
  total: 100000,
  paidNow: 100000,
  payments: [{ method: 'cash', amount: 100000 }],
  debt: 0,
  offline: false,
  ...over,
});

/** Chekda ko'rinadigan matn: teglar olib tashlanadi, HTML belgilari ochiladi */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('stol cheki (chop etish)', () => {
  it('eng tepada: chapda kichik logo, o‘ngda billiardclub.uz; katta yozuv va telefon yo‘q', () => {
    const html = renderCheckoutReceipt(base(), uz, "so'm");
    expect(RECEIPT_SITE).toBe('billiardclub.uz');
    // Tepa qator chekning birinchi elementi: avval logo (chap), keyin sayt (o'ng)
    expect(html.startsWith('<main class="rc"><header class="top"><svg class="logo"')).toBe(true);
    const top = html.slice(0, html.indexOf('</header>'));
    expect(top).toMatch(/<\/svg><span class="site">billiardclub\.uz<\/span>$/);
    expect(html.indexOf('</header>')).toBeLessThan(html.indexOf('Prime Billiard'));
    // Katta "BILLIARD CLUB" yozuvi olib tashlangan
    expect(html).not.toContain('BILLIARD CLUB');
    expect(html).not.toContain('class="word"');
    // Klub nomi, manzili va chek raqami
    const text = textOf(html);
    expect(text).toContain('Prime Billiard Toshkent, Chilonzor 12 Chek № 1234');
  });

  it('eng pastda kichik "by billiardclub.uz" — chekning oxirgi satri', () => {
    const html = renderCheckoutReceipt(base(), uz, "so'm");
    expect(html).toMatch(/<div class="by">by billiardclub\.uz<\/div><\/footer><\/main>$/);
    expect(RECEIPT_CSS).toContain('.thanks .by{');
  });

  it("o'yin ma'lumotlari: sana, stol, vaqt oralig'i, davomiylik, kassir", () => {
    const text = textOf(renderCheckoutReceipt(base({ customer: 'Sardor' }), uz, "so'm"));
    expect(text).toContain('Sana 25.11.2026');
    expect(text).toContain('Stol №3 · VIP');
    expect(text).toContain('Vaqt 19:10 – 21:40');
    expect(text).toContain('Davomiylik 02:30:00');
    expect(text).toContain('Kassir Aziz');
    expect(text).toContain('Mijoz Sardor');
    // Tarif: narx/soat × vaqt (alohida summasiz), keyin stol summasi
    expect(text).toContain(`O'yin ${money(40000)} so'm/soat × 02:30:00 Stol summasi ${money(100000)} so'm`);
  });

  it("yarim tundan o'tgan o'yin — boshlanish kuni bilan", () => {
    const html = renderCheckoutReceipt(
      base({ startedAt: local(2026, 11, 24, 23, 10), endedAt: local(2026, 11, 25, 1, 40) }),
      uz,
      "so'm",
    );
    expect(textOf(html)).toContain('Vaqt 24.11 23:10 – 01:40');
  });

  it("to'liq hisob: yaxlit stol summasi (yaxlitlash ko'rinmaydi), bar, chegirma, tuzatish, JAMI, bo'lib to'lash, qarz", () => {
    const html = renderCheckoutReceipt(
      base({
        // Yaxlitlash yoqilgan: bo'laklar aniq summasi 99 913, kassaga 100 000 yozilgan
        tableAmount: 100000,
        segments: [
          { pricePerHour: 40000, billedSeconds: 5400, amount: 60000 },
          { pricePerHour: 60000, billedSeconds: 2391, amount: 39913 },
        ],
        barLines: [
          { name: 'Coca-Cola 0.5', quantity: 2, price: 10000, subtotal: 20000 },
          { name: 'Choy', quantity: 3, price: null, subtotal: 9000 },
        ],
        barAmount: 29000,
        discount: 10000,
        adjustment: { amount: 5000, reason: 'Kiy almashtirildi' },
        total: 124000,
        paidNow: 114000,
        payments: [
          { method: 'cash', amount: 64000 },
          { method: 'card', amount: 50000 },
        ],
        debt: 10000,
      }),
      uz,
      "so'm",
    );
    const text = textOf(html);
    // Yaxlitlash va aniq summalar chiqmaydi — faqat kassaga yozilgan stol summasi
    expect(text).not.toMatch(/Yaxlitlash|aniq/);
    expect(text).not.toContain(money(99913));
    expect(text).not.toContain(money(39913));
    expect(text).toContain(
      `${money(40000)} so'm/soat × 01:30:00 ${money(60000)} so'm/soat × 00:39:51 Stol summasi ${money(100000)} so'm`,
    );
    expect(text).toContain(`Coca-Cola 0.5 2 × ${money(10000)} ${money(20000)}`);
    expect(text).toContain(`Choy × 3 ${money(9000)}`);
    expect(text).toContain(`Bar jami ${money(29000)} so'm`);
    expect(text).toContain(`Oraliq jami ${money(129000)} so'm`);
    expect(text).toContain(`Chegirma -${money(10000)} so'm`);
    expect(text).toContain(`Qo'lda tuzatish (Kiy almashtirildi) +${money(5000)} so'm`);
    expect(text).toContain(`Jami to'lov ${money(124000)} so'm`);
    expect(text).toContain(`To'landi ${money(114000)} so'm Naqd ${money(64000)} so'm Karta ${money(50000)} so'm`);
    expect(text).toContain(`Qarzga yozildi ${money(10000)} so'm`);
    expect(html).toContain('class="debt"');
    expect(text).toContain('Tashrifingiz uchun rahmat!');
    // Tartib: o'yin → bar → JAMI → to'lov
    expect(text.indexOf("O'yin")).toBeLessThan(text.indexOf('Bar jami'));
    expect(text.indexOf('Bar jami')).toBeLessThan(text.indexOf("Jami to'lov"));
    expect(text.indexOf("Jami to'lov")).toBeLessThan(text.indexOf("To'landi"));
  });

  it("bir nechta tarif yaxlitlashsiz — har birining summasi ko'rsatiladi (yig'indi = stol summasi)", () => {
    const text = textOf(
      renderCheckoutReceipt(
        base({
          segments: [
            { pricePerHour: 40000, billedSeconds: 5400, amount: 60000 },
            { pricePerHour: 60000, billedSeconds: 2400, amount: 40000 },
          ],
          tableAmount: 100000,
        }),
        uz,
        "so'm",
      ),
    );
    expect(text).toContain(
      `${money(40000)} so'm/soat × 01:30:00 ${money(60000)} ${money(60000)} so'm/soat × 00:40:00 ${money(40000)} Stol summasi`,
    );
  });

  it("bitta to'lov usuli — yorliqda; bar bo'lmasa bar bo'limi chiqmaydi", () => {
    const text = textOf(renderCheckoutReceipt(base(), uz, "so'm"));
    expect(text).toContain(`To'landi · Naqd ${money(100000)} so'm`);
    expect(text).not.toContain('Bar jami');
    expect(text).not.toContain('Oraliq jami');
    expect(text).not.toContain('Qarzga yozildi');
  });

  it('oflayn chek: sintetik ID raqam sifatida chiqmaydi, oflayn belgisi bor', () => {
    const html = renderCheckoutReceipt(base({ number: null, offline: true }), uz, "so'm");
    expect(html).toContain('class="ticket solo"');
    expect(html).not.toContain('№ ');
    expect(textOf(html)).toContain('OFLAYN');
    expect(renderCheckoutReceipt(base({ number: -3 }), uz, "so'm")).not.toContain('№ -3');
  });

  it("foydalanuvchi matni escape qilinadi (klub, mahsulot, mijoz, sabab)", () => {
    const html = renderCheckoutReceipt(
      base({
        club: { name: '<script>alert(1)</script>', address: '"Bosh" & co' },
        customer: '<img src=x onerror=alert(1)>',
        barLines: [{ name: '<b>Pivo</b>', quantity: 1, price: 15000, subtotal: 15000 }],
        barAmount: 15000,
        adjustment: { amount: -2000, reason: "<i>it's</i>" },
        total: 113000,
      }),
      uz,
      "so'm",
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>Pivo');
    expect(html).not.toContain('<i>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;Bosh&quot; &amp; co');
    expect(html).toContain('&lt;i&gt;it&#39;s&lt;/i&gt;');
    expect(textOf(html)).toContain(`-${money(2000)} so'm`);
  });

  it('katta summa — shrift kichrayadi, valyuta kerak bo‘lsa keyingi qatorga o‘tadi', () => {
    expect(renderCheckoutReceipt(base({ total: 1950000 }), uz, "so'm")).toContain('class="total-amount"');
    expect(renderCheckoutReceipt(base({ total: 12500000 }), uz, "so'm")).toContain('class="total-amount mid"');
    expect(renderCheckoutReceipt(base({ total: 125000000 }), uz, "so'm")).toContain('class="total-amount mid"');
    const huge = renderCheckoutReceipt(base({ total: 1250000000 }), uz, "so'm");
    expect(huge).toContain('class="total-amount long"');
    // Raqam bo'linmaydi, valyuta oldida bo'shliq bor — tor lentada pastga o'tadi
    expect(huge).toMatch(/<span class="tn">[^<]+<\/span> <small>so&#39;m<\/small>/);
  });

  it('ruscha chek', () => {
    const text = textOf(renderCheckoutReceipt(base({ barAmount: 5000, total: 105000 }), ru, 'сум'));
    expect(text).toContain('Чек № 1234');
    expect(text).toContain('Время 19:10 – 21:40');
    expect(text).toContain('Кассир Aziz');
    expect(text).toContain(`Итого по бару ${money(5000)} сум`);
    expect(text).toContain(`Итого к оплате ${money(105000)} сум`);
    expect(text).toContain(`Оплачено · Наличные ${money(100000)} сум`);
    expect(text).toContain('Спасибо за визит!');
  });

  it('uslub: termoprinter — faqat qora matn, chekkasiz sahifa, brend shriftlari', () => {
    expect(RECEIPT_CSS).toContain('@page{size:auto;margin:0}');
    expect(RECEIPT_CSS).toContain('max-width:80mm');
    // Tor lenta — sahifa (konteyner) kengligi bo'yicha; @media chop etishda oyna kengligini oladi
    expect(RECEIPT_CSS).toContain('body{container-type:inline-size}');
    expect(RECEIPT_CSS).toContain('@container (max-width:62mm)');
    expect(RECEIPT_CSS).not.toContain('@media');
    // Kulrang matn termoprinterda xiralashadi — faqat qora/oq ranglar
    const colors = RECEIPT_CSS.match(/(?:^|[;{])(?:color|background):#[0-9a-f]+/gi) ?? [];
    expect(colors.length).toBeGreaterThan(0);
    for (const c of colors) expect(c).toMatch(/:#(000|fff)$/i);
    for (const family of ['Onest Variable', 'Unbounded Variable', 'JetBrains Mono Variable']) {
      expect(RECEIPT_CSS).toContain(`font-family:'${family}'`);
      expect(RECEIPT_FONTS.some((f) => f.includes(family))).toBe(true);
    }
    expect(RECEIPT_CSS).toMatch(/src:url\([^)]*onest-latin-wght-normal[^)]*\.woff2\)/);
  });
});

describe('chek uchun bar pozitsiyalari', () => {
  const item = (productId: number, quantity: number, price: number, name?: string): OrderItem => ({
    id: productId * 100 + quantity,
    orderId: 1,
    productId,
    quantity,
    price,
    subtotal: quantity * price,
    product: name ? ({ name } as OrderItem['product']) : undefined,
  });
  const order = (status: Order['status'], items: OrderItem[]): Order => ({
    id: Math.floor(Math.random() * 1e6),
    clubId: 1,
    sessionId: 7,
    tableId: 1,
    userId: 1,
    totalAmount: items.reduce((a, i) => a + i.subtotal, 0),
    status,
    notes: null,
    createdAt: new Date().toISOString(),
    items,
  });
  const unknown = (id: number) => `Mahsulot #${id}`;

  it("bekor qilinganlar chiqmaydi, bir mahsulot bitta qatorga yig'iladi", () => {
    const lines = receiptBarLines(
      [
        order('closed', [item(1, 2, 10000, 'Cola'), item(2, 1, 4000, 'Chips')]),
        order('closed', [item(1, 1, 10000, 'Cola')]),
        order('cancelled', [item(3, 5, 7000, 'Pivo')]),
      ],
      34000,
      unknown,
    );
    expect(lines).toEqual([
      { name: 'Cola', quantity: 3, price: 10000, subtotal: 30000 },
      { name: 'Chips', quantity: 1, price: 4000, subtotal: 4000 },
    ]);
  });

  it("o'chirilgan mahsulot nomi; yig'indi mos kelmasa yoki bo'sh bo'lsa — null", () => {
    expect(receiptBarLines([order('closed', [item(9, 1, 5000)])], 5000, unknown)).toEqual([
      { name: 'Mahsulot #9', quantity: 1, price: 5000, subtotal: 5000 },
    ]);
    expect(receiptBarLines([order('closed', [item(1, 1, 5000, 'Cola')])], 6000, unknown)).toBeNull();
    expect(receiptBarLines([], 0, unknown)).toBeNull();
    expect(receiptBarLines(undefined, 0, unknown)).toBeNull();
  });
});
