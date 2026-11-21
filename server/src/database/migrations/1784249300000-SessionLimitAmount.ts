import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * sessions.limitAmount — SUMMA LIMITI ("50 000 so'mga o'ynayman").
 *
 * Kassir o'yinni boshlashda vaqt o'rniga pul miqdorini kiritadi; stol summasi
 * shu qiymatga yetganda kartada "limit tugadi" belgisi va ovozli signal chiqadi.
 * Qolgan vaqt klientda stolning JORIY narxidan hisoblanadi, shuning uchun
 * transferdan keyin yangi stol narxi bo'yicha o'zi qayta hisoblanadi.
 *
 * plannedMinutes kabi pul hisobiga TA'SIR QILMAYDI (hisob haqiqiy vaqt bo'yicha
 * soniyalik qoladi). Eski sessiyalar uchun NULL — ma'lumot ko'chirish shart emas.
 *
 * Cheklov bitta: limit musbat bo'lishi va belgilangan vaqt (plannedMinutes)
 * bilan BIRGA qo'yilmasligi kerak — ikkalasi bir xil ogohlantirishning ikki
 * turi, birga bo'lsa qaysi biri kuchda ekani noaniq qolardi.
 */
export class SessionLimitAmount1784249300000 implements MigrationInterface {
  name = 'SessionLimitAmount1784249300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "limitAmount" numeric(14,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "chk_sessions_limit_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "chk_sessions_limit_amount"
         CHECK ("limitAmount" IS NULL OR ("limitAmount" > 0 AND "plannedMinutes" IS NULL))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "chk_sessions_limit_amount"`,
    );
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN IF EXISTS "limitAmount"`);
  }
}
