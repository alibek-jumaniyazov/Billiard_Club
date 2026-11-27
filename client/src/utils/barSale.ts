import type { PaymentMethod, Product } from '../types';

/**
 * STOLSIZ BAR SAVDOSI — kassa ekranidagi sof hisob (DOM'siz, barSale.test.ts).
 * Server qoidasi bilan bir xil (server/src/modules/orders/bar-sale.service.ts):
 *  - chegirma 0..jami oralig'ida;
 *  - qarzga sotilsa butun summa qarz, to'lov satri yo'q;
 *  - aks holda to'lov satrlari yig'indisi to'lanadigan summaga TENG.
 */

/** Savatdagi qator: mahsulot va miqdor */
export interface BarCartLine {
  productId: number;
  quantity: number;
}

/** To'lov turi: bitta usul yoki aralash (naqd + karta, karta — qoldiq) */
export type BarPayMode = PaymentMethod | 'mixed';

/** Bitta so'rovdagi pozitsiyalar chegarasi — server @ArrayMaxSize(50) bilan bir xil */
export const BAR_SALE_MAX_LINES = 50;
/** Bitta pozitsiya miqdori chegarasi — server @Max(1000) bilan bir xil */
export const BAR_SALE_MAX_QUANTITY = 1000;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Savatga mahsulot qo'shish (bor bo'lsa miqdor +1); chegaralar saqlanadi */
export const addToCart = (cart: BarCartLine[], productId: number): BarCartLine[] => {
  const index = cart.findIndex((line) => line.productId === productId);
  if (index >= 0) {
    return cart.map((line, i) =>
      i === index ? { ...line, quantity: Math.min(BAR_SALE_MAX_QUANTITY, line.quantity + 1) } : line,
    );
  }
  if (cart.length >= BAR_SALE_MAX_LINES) return cart;
  return [...cart, { productId, quantity: 1 }];
};

/** Miqdorni o'rnatish; 0 yoki undan kam — qator olib tashlanadi */
export const setCartQuantity = (cart: BarCartLine[], productId: number, quantity: number): BarCartLine[] => {
  const q = Math.min(BAR_SALE_MAX_QUANTITY, Math.trunc(Number.isFinite(quantity) ? quantity : 0));
  if (q <= 0) return cart.filter((line) => line.productId !== productId);
  return cart.map((line) => (line.productId === productId ? { ...line, quantity: q } : line));
};

export interface BarSaleTotals {
  /** Pozitsiyalar yig'indisi (chegirmadan oldin) */
  gross: number;
  /** Qo'llanadigan chegirma (0..gross) */
  discount: number;
  /** To'lanadigan summa */
  toPay: number;
  /** Savatdagi jami dona */
  count: number;
}

/** Jami, chegirma va to'lanadigan summa — katalogdan topilmagan qator hisobga olinmaydi */
export const barSaleTotals = (
  cart: BarCartLine[],
  products: Pick<Product, 'id' | 'price'>[],
  discount: number | null | undefined,
): BarSaleTotals => {
  const priceOf = new Map(products.map((p) => [p.id, p.price]));
  let gross = 0;
  let count = 0;
  for (const line of cart) {
    const price = priceOf.get(line.productId);
    if (price === undefined) continue;
    gross = round2(gross + price * line.quantity);
    count += line.quantity;
  }
  const d = round2(Math.min(Math.max(Number(discount) || 0, 0), gross));
  return { gross, discount: d, toPay: round2(gross - d), count };
};

/**
 * To'lov satrlari. Aralash: kiritilgan naqd + qoldiq karta (ikkalasi ham > 0 bo'lishi
 * shart emas — 0 li satr yuborilmaydi). Noto'g'ri bo'lsa (naqd manfiy yoki to'lanadigandan
 * ko'p) — null: tugma faollashmaydi.
 */
export const barSalePayments = (
  mode: BarPayMode,
  toPay: number,
  cashPart?: number | null,
): Array<{ method: PaymentMethod; amount: number }> | null => {
  if (toPay <= 0) return [];
  if (mode !== 'mixed') return [{ method: mode, amount: round2(toPay) }];
  const cash = round2(Number(cashPart) || 0);
  if (cash < 0 || cash > toPay) return null;
  return [
    { method: 'cash' as PaymentMethod, amount: cash },
    { method: 'card' as PaymentMethod, amount: round2(toPay - cash) },
  ].filter((p) => p.amount > 0);
};

export interface BarSaleCustomerInput {
  /** Ro'yxatdagi mijoz (oflayn qarzda majburiy) */
  customerId?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
}

export interface BarSalePayload {
  items: Array<{ productId: number; quantity: number; price: number }>;
  paymentMethod?: PaymentMethod;
  payments?: Array<{ method: PaymentMethod; amount: number }>;
  discount?: number;
  isDebt?: boolean;
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

/**
 * Serverga yuboriladigan tana. Har pozitsiyada kassir ko'rgan narx — onlayn server uni
 * joriy narx bilan solishtiradi (o'zgargan bo'lsa 409), oflayn esa aynan shu narxni yozadi.
 */
export const buildBarSalePayload = (input: {
  cart: BarCartLine[];
  products: Pick<Product, 'id' | 'price'>[];
  discount?: number | null;
  mode: BarPayMode;
  cashPart?: number | null;
  isDebt: boolean;
  customer?: BarSaleCustomerInput;
  notes?: string | null;
}): BarSalePayload | null => {
  const priceOf = new Map(input.products.map((p) => [p.id, p.price]));
  const items = input.cart
    .filter((line) => line.quantity >= 1 && priceOf.has(line.productId))
    .map((line) => ({ productId: line.productId, quantity: Math.trunc(line.quantity), price: priceOf.get(line.productId)! }));
  if (items.length === 0) return null;

  const totals = barSaleTotals(input.cart, input.products, input.discount);
  const payload: BarSalePayload = { items };
  if (totals.discount > 0) payload.discount = totals.discount;

  const customerName = input.customer?.customerName?.trim();
  const customerPhone = input.customer?.customerPhone?.trim();
  if (input.customer?.customerId) payload.customerId = input.customer.customerId;
  if (customerName) payload.customerName = customerName;
  if (customerPhone) payload.customerPhone = customerPhone;
  const notes = input.notes?.trim();
  if (notes) payload.notes = notes;

  if (input.isDebt) {
    // Qarzga — mijoz ismi (yoki ro'yxatdagi mijoz) shart
    if (!payload.customerId && !payload.customerName) return null;
    payload.isDebt = true;
    return payload;
  }
  const payments = barSalePayments(input.mode, totals.toPay, input.cashPart);
  if (payments === null) return null;
  if (input.mode === 'mixed') payload.payments = payments;
  else payload.paymentMethod = input.mode;
  return payload;
};
