import { describe, expect, it } from 'vitest';
import {
  BAR_SALE_MAX_LINES,
  BAR_SALE_MAX_QUANTITY,
  addToCart,
  barSalePayments,
  barSaleTotals,
  buildBarSalePayload,
  setCartQuantity,
} from './barSale';

const products = [
  { id: 1, price: 8000 },
  { id: 2, price: 12000 },
];

describe('stolsiz bar savdosi: savat', () => {
  it("qo'shish miqdorni oshiradi, chegaralar saqlanadi", () => {
    let cart = addToCart([], 1);
    cart = addToCart(cart, 1);
    cart = addToCart(cart, 2);
    expect(cart).toEqual([
      { productId: 1, quantity: 2 },
      { productId: 2, quantity: 1 },
    ]);
    expect(addToCart([{ productId: 1, quantity: BAR_SALE_MAX_QUANTITY }], 1)[0].quantity).toBe(BAR_SALE_MAX_QUANTITY);
    const full = Array.from({ length: BAR_SALE_MAX_LINES }, (_, i) => ({ productId: 100 + i, quantity: 1 }));
    expect(addToCart(full, 1)).toHaveLength(BAR_SALE_MAX_LINES);
  });

  it("miqdor o'rnatiladi; 0 — qator olib tashlanadi; kasr kesiladi", () => {
    const cart = [{ productId: 1, quantity: 2 }];
    expect(setCartQuantity(cart, 1, 5.7)).toEqual([{ productId: 1, quantity: 5 }]);
    expect(setCartQuantity(cart, 1, 0)).toEqual([]);
    expect(setCartQuantity(cart, 1, Number.NaN)).toEqual([]);
  });
});

describe('stolsiz bar savdosi: hisob', () => {
  it("jami, chegirma (0..jami) va to'lanadigan summa", () => {
    const cart = [
      { productId: 1, quantity: 2 },
      { productId: 2, quantity: 1 },
      { productId: 99, quantity: 3 }, // katalogda yo'q — hisobga olinmaydi
    ];
    expect(barSaleTotals(cart, products, 0)).toEqual({ gross: 28000, discount: 0, toPay: 28000, count: 3 });
    expect(barSaleTotals(cart, products, 3000)).toEqual({ gross: 28000, discount: 3000, toPay: 25000, count: 3 });
    expect(barSaleTotals(cart, products, 50000).toPay).toBe(0);
    expect(barSaleTotals(cart, products, -5).discount).toBe(0);
  });

  it("to'lov satrlari: bitta usul, aralash (naqd + qoldiq karta), noto'g'ri naqd", () => {
    expect(barSalePayments('card', 25000)).toEqual([{ method: 'card', amount: 25000 }]);
    expect(barSalePayments('mixed', 25000, 10000)).toEqual([
      { method: 'cash', amount: 10000 },
      { method: 'card', amount: 15000 },
    ]);
    expect(barSalePayments('mixed', 25000, 25000)).toEqual([{ method: 'cash', amount: 25000 }]);
    expect(barSalePayments('mixed', 25000, 30000)).toBeNull();
    expect(barSalePayments('mixed', 25000, -1)).toBeNull();
    expect(barSalePayments('cash', 0)).toEqual([]);
  });
});

describe('stolsiz bar savdosi: serverga tana', () => {
  const cart = [
    { productId: 1, quantity: 2 },
    { productId: 2, quantity: 1 },
  ];

  it("narx har pozitsiyada; bitta usul — paymentMethod; chegirma va izoh", () => {
    expect(
      buildBarSalePayload({ cart, products, discount: 3000, mode: 'cash', isDebt: false, notes: '  Bar ' }),
    ).toEqual({
      items: [
        { productId: 1, quantity: 2, price: 8000 },
        { productId: 2, quantity: 1, price: 12000 },
      ],
      discount: 3000,
      paymentMethod: 'cash',
      notes: 'Bar',
    });
  });

  it("aralash — payments; noto'g'ri naqd yoki bo'sh savat — null", () => {
    const payload = buildBarSalePayload({ cart, products, mode: 'mixed', cashPart: 8000, isDebt: false });
    expect(payload?.payments).toEqual([
      { method: 'cash', amount: 8000 },
      { method: 'card', amount: 20000 },
    ]);
    expect(payload?.paymentMethod).toBeUndefined();
    expect(buildBarSalePayload({ cart, products, mode: 'mixed', cashPart: 99999, isDebt: false })).toBeNull();
    expect(buildBarSalePayload({ cart: [], products, mode: 'cash', isDebt: false })).toBeNull();
  });

  it("qarzga — mijoz shart, to'lov satri yuborilmaydi", () => {
    expect(buildBarSalePayload({ cart, products, mode: 'cash', isDebt: true })).toBeNull();
    expect(
      buildBarSalePayload({ cart, products, mode: 'cash', isDebt: true, customer: { customerName: ' Jasur ', customerPhone: '+998901112233' } }),
    ).toEqual({
      items: [
        { productId: 1, quantity: 2, price: 8000 },
        { productId: 2, quantity: 1, price: 12000 },
      ],
      isDebt: true,
      customerName: 'Jasur',
      customerPhone: '+998901112233',
    });
    expect(buildBarSalePayload({ cart, products, mode: 'cash', isDebt: true, customer: { customerId: 7 } })?.customerId).toBe(7);
  });
});
