import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Review natijasidagi tuzatishlar:
 *  - sessions.pricePerHour — sessiya boshlanganda stol narxi muhrlanadi;
 *    o'yin davomida narx o'zgartirilsa hisob retroaktiv o'zgarmaydi
 *  - users.tokenVersion — parol almashtirilganda eski access/refresh
 *    tokenlar darhol bekor bo'ladi
 */
export class PriceSnapshotAndTokenVersion1784246800000 implements MigrationInterface {
  name = 'PriceSnapshotAndTokenVersion1784246800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" ADD "pricePerHour" numeric(14,2)`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "tokenVersion" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tokenVersion"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "pricePerHour"`);
  }
}
