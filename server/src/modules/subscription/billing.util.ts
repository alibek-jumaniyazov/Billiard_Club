import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Coupon } from '../../entities/coupon.entity';
import { CouponType } from '../../entities/enums';
import { ContractType } from '../../entities/contract.entity';
import { Plan } from '../../entities/plan.entity';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Tarif davomiyligidan shartnoma turini aniqlash evristikasi.
 * Oy uzunligi o'zgaruvchan bo'lgani uchun oraliqlar bilan tekshiriladi.
 */
export const contractTypeFromDays = (days: number): ContractType => {
  if (days >= 28 && days <= 31) return ContractType.MONTHLY;
  if (days >= 88 && days <= 93) return ContractType.QUARTERLY;
  if (days >= 178 && days <= 186) return ContractType.SEMIANNUAL;
  if (days >= 360 && days <= 372) return ContractType.YEARLY;
  return ContractType.CUSTOM;
};

/**
 * Navbatdagi hisob-faktura raqami: INV-<yil>-<6 xonali tartib>.
 * Bir vaqtda ikkita bir xil raqam olinmasligi uchun tranzaksiya
 * darajasidagi advisory lock ishlatiladi (unique indeks — oxirgi himoya).
 */
export const nextInvoiceNumber = async (manager: EntityManager): Promise<string> => {
  await manager.query(`SELECT pg_advisory_xact_lock(hashtext('invoices_number'))`);
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  // Nol bilan to'ldirilgan bir xil uzunlikdagi raqamlar — matn tartibi son tartibiga teng
  const rows: Array<{ number: string }> = await manager.query(
    `SELECT "number" FROM "invoices" WHERE "number" LIKE $1 ORDER BY "number" DESC LIMIT 1`,
    [`${prefix}%`],
  );
  const lastSeq = rows.length > 0 ? parseInt(rows[0].number.slice(prefix.length), 10) : 0;
  return `${prefix}${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(6, '0')}`;
};

/**
 * Kuponni tarifga nisbatan tekshirish: faollik, amal qilish oynasi,
 * ishlatish limiti va tarif mosligi. Muvaffaqiyatda kupon qaytadi.
 */
export const validateCouponForPlan = (coupon: Coupon | null, plan: Plan): Coupon => {
  if (!coupon) throw new BadRequestException({ key: 'subscription.couponNotFound' });
  if (!coupon.isActive) throw new BadRequestException({ key: 'subscription.couponInactive' });

  const now = Date.now();
  if (coupon.validFrom && new Date(coupon.validFrom).getTime() > now) {
    throw new BadRequestException({ key: 'subscription.couponNotYetValid' });
  }
  if (coupon.validTo && new Date(coupon.validTo).getTime() < now) {
    throw new BadRequestException({ key: 'subscription.couponExpired' });
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    throw new BadRequestException({ key: 'subscription.couponUsedUp' });
  }
  if (coupon.planId !== null && coupon.planId !== plan.id) {
    throw new BadRequestException({ key: 'subscription.couponWrongPlan' });
  }
  return coupon;
};

/** Chegirma summasi: percent — narxdan foiz, fixed — qat'iy summa; narxdan oshmaydi */
export const couponDiscount = (coupon: Coupon, price: number): number => {
  const raw = coupon.type === CouponType.PERCENT ? (price * coupon.value) / 100 : coupon.value;
  return Math.min(round2(raw), price);
};
