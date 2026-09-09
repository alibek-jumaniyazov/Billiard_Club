import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pul yo'lidagi eng katta jadvallar uchun (clubId, <vaqt>) KOMPOZIT indekslari.
 *
 * Har bir tushum so'rovi tenant + sana oralig'i bo'yicha filtrlaydi:
 *  - dashboard (har ochilganda): sales/debt_payments (clubId + createdAt oynasi),
 *    sessions (clubId + status='completed' + endTime oynasi);
 *  - reports.getReport: sales/debt_payments/debts (clubId + createdAt), sessions
 *    (clubId + status + endTime), Excel eksport (endTime bo'yicha keyset);
 *  - sessions.findAll ro'yxati: clubId + ORDER BY createdAt DESC.
 *
 * Bu jadvallarda esa AVVAL faqat ALOHIDA bir ustunli indekslar bor edi
 * (`(clubId)` va `(createdAt)`/`(endTime)` alohida) — Postgres bitta klub oyi
 * uchun ham yo BUTUN klub tarixini (clubId indeksi), yo BUTUN platforma sana
 * oynasini (createdAt indeksi) skanerdan o'tkazib, qolganini heap'da filtrlashga
 * majbur bo'lardi. Ya'ni dashboard/hisobot tezligi klub o'z ma'lumoti emas,
 * PLATFORMANING umumiy hajmiga qarab sekinlashardi.
 *
 * Aka-uka jadvallar allaqachon shu naqshda kompozit olgan: orders(clubId,createdAt),
 * expenses(clubId,spentAt), session_payments/invoices/audit_logs/reservations/
 * feedbacks/club_notifications. Bu uchta pul jadvali va sessions oddiygina
 * o'tkazib yuborilgan edi.
 *
 * `IF NOT EXISTS`: juda katta amaldagi jadvalda operator indeksni QO'LDA
 * `CREATE INDEX CONCURRENTLY` bilan (qulf ushlab qolmasdan) oldindan qurgan
 * bo'lsa, migratsiya uni takrorlab yiqilmasin. Migratsiya tranzaksiya ichida
 * ishlagani uchun bu yerda CONCURRENTLY ishlatib bo'lmaydi (u tranzaksiyada
 * ishlamaydi) — kichik/o'rta jadvalda oddiy CREATE INDEX yetarli.
 */
export class MoneyTableCompositeIndexes1784248200000 implements MigrationInterface {
  name = 'MoneyTableCompositeIndexes1784248200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_club_createdAt" ON "sales" ("clubId", "createdAt" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_debt_payments_club_createdAt" ON "debt_payments" ("clubId", "createdAt" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_debts_club_createdAt" ON "debts" ("clubId", "createdAt" DESC)`,
    );
    // Ro'yxat sahifasi: WHERE clubId ... ORDER BY createdAt DESC
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sessions_club_createdAt" ON "sessions" ("clubId", "createdAt" DESC)`,
    );
    // Hisobot/dashboard: WHERE clubId AND status='completed' AND endTime oynasi
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sessions_club_endTime" ON "sessions" ("clubId", "endTime" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_sessions_club_endTime"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_sessions_club_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_debts_club_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_debt_payments_club_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_sales_club_createdAt"`);
  }
}
