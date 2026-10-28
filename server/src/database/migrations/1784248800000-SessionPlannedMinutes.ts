import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * sessions.plannedMinutes — belgilangan vaqtli o'yin ("1 soatga").
 *
 * Pul hisobiga TA'SIR QILMAYDI (hisob haqiqiy vaqt bo'yicha soniyalik qoladi);
 * ustun faqat kassirga "vaqt tugadi" ogohlantirishini berish uchun. Shuning
 * uchun eski sessiyalar uchun NULL (cheklanmagan) — ma'lumot ko'chirish shart emas.
 */
export class SessionPlannedMinutes1784248800000 implements MigrationInterface {
  name = 'SessionPlannedMinutes1784248800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" ADD "plannedMinutes" integer`);
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "chk_sessions_planned_minutes"
         CHECK ("plannedMinutes" IS NULL OR ("plannedMinutes" > 0 AND "plannedMinutes" <= 1440))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" DROP CONSTRAINT "chk_sessions_planned_minutes"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "plannedMinutes"`);
  }
}
