import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * audit_logs."createdAt" uchun alohida indeks.
 *
 * Ixtiyoriy saqlash-muddati tozalagichi (AuditCleanupService, AUDIT_RETENTION_DAYS
 * qo'yilganda ishlaydi) `WHERE "createdAt" < ...` bo'yicha o'chiradi. Jadvalda
 * (clubId,createdAt) va (action,createdAt) kompozitlari bor, lekin ularda
 * createdAt IKKINCHI ustun — createdAt-only predikatni tezlashtirmaydi. Boshqa
 * tozalash cron'lari (refresh_sessions."expiresAt", idempotency_keys."createdAt",
 * table_light_events."at") ham xuddi shunday o'z filtr ustuniga alohida indeks
 * oladi. Indeks yengil; tozalash yoqilmagan bo'lsa ham qidiruv/browsing'ga foyda.
 */
export class AuditLogsCreatedAtIndex1784248300000 implements MigrationInterface {
  name = 'AuditLogsCreatedAtIndex1784248300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_createdAt" ON "audit_logs" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_audit_logs_createdAt"`);
  }
}
