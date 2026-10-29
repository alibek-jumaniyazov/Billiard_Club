import type { OrderItem } from '../types';
import { formatClock } from './format';

/** Chekdagi bitta qator — bir mahsulotning buyurtmadagi jami miqdori */
export interface OrderLine {
  productId: number;
  /** Mahsulot o'chirilgan bo'lsa bo'sh — nomni chaqiruvchi tarjima qiladi */
  name: string;
  quantity: number;
  /** Birlik narxi; mahsulot turli narxda qo'shilgan bo'lsa null */
  price: number | null;
  subtotal: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Har "qo'shish" serverda alohida qator bo'ladi: bir choy uch marta
 * qo'shilsa — uch qator. Chekda mahsulot bo'yicha bitta qatorga yig'amiz,
 * birinchi qo'shilgan tartibda.
 */
export const groupOrderItems = (items: OrderItem[] | null | undefined): OrderLine[] => {
  const lines = new Map<number, OrderLine>();
  for (const item of items ?? []) {
    const line = lines.get(item.productId);
    if (line) {
      line.quantity += item.quantity;
      line.subtotal = round2(line.subtotal + item.subtotal);
      if (line.price !== item.price) line.price = null;
    } else {
      lines.set(item.productId, {
        productId: item.productId,
        name: item.product?.name ?? '',
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal,
      });
    }
  }
  return [...lines.values()];
};

/*
 * Buyurtmalar sahifasi ko'rinishi oynaga emas, SAHIFA kengligiga qarab
 * tanlanadi: 1024px planshetda yon menyu ochiq bo'lsa sahifa 800px li
 * oynadagidan ham tor. Ro'yxat chegaralari jadval ustunlarining eng kichik
 * kengligidan (panel chekinishi bilan): ixcham ~630px, to'liq ~960px.
 */
const COMPACT_TABLE_FROM = 672;
const FULL_TABLE_FROM = 1010;
/*
 * Ko'rsatkichlar: sig'sa 4 tasi bir qatorda (ro'yxat yuqoriroq turadi), aks
 * holda 2×2. Karta torayganda avval ikonka yashiriladi, keyin shrift
 * kichrayadi — katta summa (12 450 000 so'm) hech qachon kesilmasin.
 */
export const KPI_GAP = 12;
const KPI_MIN_WIDTH = 160;
const KPI_COMPACT_BELOW = 210;
const KPI_ICONS_FROM = 300;

export interface OrdersPageLayout {
  /** Telefon — kartalar, planshet — ixcham jadval, kompyuter — to'liq jadval */
  list: 'cards' | 'compact' | 'full';
  kpisPerRow: 2 | 4;
  /** compact — ikonkasiz, kichik shrift; tight — ikonkasiz; regular — to'liq */
  kpiSize: 'compact' | 'tight' | 'regular';
}

export const ordersPageLayout = (width: number): OrdersPageLayout => {
  const kpisPerRow = (width - 3 * KPI_GAP) / 4 >= KPI_MIN_WIDTH ? 4 : 2;
  const kpiWidth = (width - (kpisPerRow - 1) * KPI_GAP) / kpisPerRow;
  return {
    list: width >= FULL_TABLE_FROM ? 'full' : width >= COMPACT_TABLE_FROM ? 'compact' : 'cards',
    kpisPerRow,
    kpiSize: kpiWidth < KPI_COMPACT_BELOW ? 'compact' : kpiWidth < KPI_ICONS_FROM ? 'tight' : 'regular',
  };
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * Buyurtma vaqti ro'yxat uchun: "Bugun, 21:07", "Kecha, 23:40",
 * shu yil — "28.10, 18:15", oldingi yillar — "28.10.2025, 18:15".
 */
export const orderTimeLabel = (
  iso: string,
  words: { today: string; yesterday: string },
  now: Date = new Date(),
): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const clock = formatClock(date);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return `${words.today}, ${clock}`;
  if (days === 1) return `${words.yesterday}, ${clock}`;
  const day = `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}`;
  return date.getFullYear() === now.getFullYear()
    ? `${day}, ${clock}`
    : `${day}.${date.getFullYear()}, ${clock}`;
};
