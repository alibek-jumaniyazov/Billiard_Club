import { describe, expect, it } from 'vitest';
import { ClubBlockReason } from '../../../server/src/entities/enums';
import locked from '../i18n/pages/locked';
import { BLOCK_REASONS, isPaymentResolvable } from './blockReasons';

describe('klub blok sabablari', () => {
  it("server ro'yxati bilan bir xil", () => {
    expect([...BLOCK_REASONS]).toEqual(Object.values(ClubBlockReason));
  });

  it("har bir sababning sarlavhasi va tushuntirishi ikkala tilda bor", () => {
    for (const lang of ['uz', 'ru'] as const) {
      const dict = locked[lang] as Record<string, string>;
      for (const reason of BLOCK_REASONS) {
        expect(dict[`reason.${reason}`], `${lang}: reason.${reason}`).toBeTruthy();
        expect(dict[`reasonDesc.${reason}`], `${lang}: reasonDesc.${reason}`).toBeTruthy();
      }
    }
  });

  it("bepul tarifdan noto'g'ri foydalanish va to'lanmagan blok — obuna bilan hal bo'ladi", () => {
    expect(BLOCK_REASONS.filter((reason) => isPaymentResolvable(reason))).toEqual(['free_plan_abuse', 'unpaid']);
    expect(isPaymentResolvable(null)).toBe(false);
    expect(isPaymentResolvable(undefined)).toBe(false);
  });
});
