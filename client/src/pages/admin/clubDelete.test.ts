import { describe, expect, it } from 'vitest';
import adminClubs from '../../i18n/pages/adminClubs';
import type { ClubDeletePreview } from '../../types';
import { CLUB_DELETE_ROWS, clubDeleteKeepsBilling, clubDeleteRows, confirmNameMatches } from './clubDelete';

const preview = (counts: Record<string, number>, billing: Partial<ClubDeletePreview['billing']> = {}): ClubDeletePreview => ({
  club: { id: 7, name: 'Prime Billiard' },
  counts,
  billing: { contracts: 0, contractsAmount: 0, paidInvoices: 0, paidInvoicesAmount: 0, unpaidInvoices: 0, ...billing },
});

describe("klubni butunlay o'chirish oynasi", () => {
  it("faqat noldan katta bo'limlar, belgilangan tartibda; texnik jadvallar chiqmaydi", () => {
    const rows = clubDeleteRows(
      preview({ orders: 12, users: 3, sessions: 40, settings: 1, idempotency_keys: 9, session_payments: 40, tables: 0 }),
    );
    expect(rows).toEqual([
      { key: 'users', count: 3 },
      { key: 'sessions', count: 40 },
      { key: 'orders', count: 12 },
    ]);
    expect(clubDeleteRows(preview({}))).toEqual([]);
  });

  it("to'lov tarixi: shartnoma yoki to'langan faktura bo'lsa saqlanadi", () => {
    expect(clubDeleteKeepsBilling(preview({}))).toBe(false);
    expect(clubDeleteKeepsBilling(preview({}, { unpaidInvoices: 2 }))).toBe(false);
    expect(clubDeleteKeepsBilling(preview({}, { contracts: 1, contractsAmount: 500000 }))).toBe(true);
    expect(clubDeleteKeepsBilling(preview({}, { paidInvoices: 1 }))).toBe(true);
  });

  it("tasdiq nomi aynan mos bo'lishi shart (faqat chetdagi bo'shliqlar e'tiborsiz)", () => {
    expect(confirmNameMatches('Prime Billiard', 'Prime Billiard')).toBe(true);
    expect(confirmNameMatches('  Prime Billiard ', 'Prime Billiard')).toBe(true);
    expect(confirmNameMatches('prime billiard', 'Prime Billiard')).toBe(false);
    expect(confirmNameMatches('Prime', 'Prime Billiard')).toBe(false);
    expect(confirmNameMatches('', '')).toBe(false);
    expect(confirmNameMatches('   ', '  ')).toBe(false);
  });

  it("har bir bo'lim yorlig'i ikkala tilda bor", () => {
    for (const lang of ['uz', 'ru'] as const) {
      const dict = adminClubs[lang] as Record<string, string>;
      for (const key of CLUB_DELETE_ROWS) expect(dict[`purge_${key}`], `${lang}: purge_${key}`).toBeTruthy();
    }
  });
});
