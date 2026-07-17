import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sekundlik hisob v2 — segment darajasidagi pauza hisobi.
 *
 * session_segments.pausedMs: segment ochiq bo'lgan davrda yig'ilgan pauzalar (ms).
 * resume() sessiya pauzasini JORIY ochiq segmentga ham qo'shadi; pauzada transfer
 * taqiqlangani uchun har bir pauza to'liq bitta segment ichida yotadi.
 * Segment bo'yicha hisob:
 *   billedSeconds = floor((min(endedAt ?? now, sessiyaTugashi) - startedAt - pausedMs) / 1000)
 *   summa = round2(pricePerHour * billedSeconds / 3600)
 */
export class SegmentPausedMs1784247200000 implements MigrationInterface {
  name = 'SegmentPausedMs1784247200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "session_segments" ADD "pausedMs" bigint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`
      ALTER TABLE "session_segments"
      ADD CONSTRAINT "chk_session_segments_pausedMs_nonneg" CHECK ("pausedMs" >= 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "session_segments" DROP CONSTRAINT "chk_session_segments_pausedMs_nonneg"`,
    );
    await queryRunner.query(`ALTER TABLE "session_segments" DROP COLUMN "pausedMs"`);
  }
}
