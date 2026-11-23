import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * STOLDA YIG'ILGAN PULNI YAXLITLASH (Sozlamalar → Hisob-kitob).
 *
 *  - settings.tableRoundingStep — klub sozlamasi: 0 (o'chiq) yoki 100/500/1000/5000;
 *  - sessions.roundingStep      — o'yin boshlanganda muhrlangan qadam (barcha
 *    kassalar jonli summani shu bilan ko'rsatadi, yakun ham shu bilan);
 *  - sessions.tableRounding     — yakunda qo'llangan farq (yaxlit − aniq),
 *    ya'ni aniq sekundlik summa = tableAmount − tableRounding.
 *
 * Hamma ustunlar 0 standart bilan: mavjud klublar va eski o'yinlar o'zgarmaydi
 * (yaxlitlash ixtiyoriy, egasi sozlamadan yoqadi). PostgreSQL 11+ da doimiy
 * standartli ustun qo'shish jadvalni qayta yozmaydi — sessions katta bo'lsa ham tez.
 */
export class TableRounding1784249500000 implements MigrationInterface {
  name = 'TableRounding1784249500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "tableRoundingStep" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "chk_settings_table_rounding_step"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD CONSTRAINT "chk_settings_table_rounding_step"
         CHECK ("tableRoundingStep" IN (0, 100, 500, 1000, 5000))`,
    );

    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "roundingStep" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "tableRounding" numeric(14,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "chk_sessions_rounding_step"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "chk_sessions_rounding_step"
         CHECK ("roundingStep" IN (0, 100, 500, 1000, 5000))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "chk_sessions_rounding_step"`,
    );
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN IF EXISTS "tableRounding"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN IF EXISTS "roundingStep"`);
    await queryRunner.query(
      `ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "chk_settings_table_rounding_step"`,
    );
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN IF EXISTS "tableRoundingStep"`);
  }
}
