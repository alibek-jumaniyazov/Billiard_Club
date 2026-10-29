import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * tables.zone — stollarni zonalarga (zal, o'yin turi) bo'lish: "Rus bilyardi",
 * "Pul", "VIP zal". Stollar paneli shu bo'yicha guruhlanadi. Mavjud stollar
 * uchun NULL — panel avvalgidek bitta ro'yxat ko'rinishida qoladi.
 */
export class TableZones1784248900000 implements MigrationInterface {
  name = 'TableZones1784248900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tables" ADD "zone" character varying(50)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "zone"`);
  }
}
