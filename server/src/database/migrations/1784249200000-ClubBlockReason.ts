import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * KLUB BLOK SABABI: superadmin bloklashda tayyor sababni tanlaydi va klubga
 * ko'rinadigan izoh yozadi (ikkalasi ixtiyoriy). Bloklangan klub kirganda
 * ekranida sabab va tavsiya chiqadi.
 *
 *  - clubs.blockReason — tayyor ro'yxatdagi kod (ClubBlockReason). Qiymatlar
 *    shu yerda ATAYLAB nusxalangan: migratsiya keyin kod o'zgarsa ham o'sha
 *    natijani berishi kerak.
 *  - clubs.blockNote — klubga ko'rinadigan izoh (500 belgigacha).
 *  - clubs.blockedAt — bloklangan vaqt. Mavjud bloklangan klublarda bo'sh
 *    qoladi: aniq sanasi noma'lum, taxminiy sana yozilmaydi.
 */
export class ClubBlockReason1784249200000 implements MigrationInterface {
  name = 'ClubBlockReason1784249200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "blockReason" varchar(40)`);
    await queryRunner.query(`ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "blockNote" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "blockedAt" timestamptz`);
    await queryRunner.query(`ALTER TABLE "clubs" DROP CONSTRAINT IF EXISTS "chk_clubs_block_reason"`);
    await queryRunner.query(
      `ALTER TABLE "clubs" ADD CONSTRAINT "chk_clubs_block_reason" CHECK ("blockReason" IN ('free_plan_abuse', 'unpaid', 'rules_violation', 'suspicious_activity', 'owner_request', 'other'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clubs" DROP CONSTRAINT IF EXISTS "chk_clubs_block_reason"`);
    await queryRunner.query(`ALTER TABLE "clubs" DROP COLUMN IF EXISTS "blockedAt"`);
    await queryRunner.query(`ALTER TABLE "clubs" DROP COLUMN IF EXISTS "blockNote"`);
    await queryRunner.query(`ALTER TABLE "clubs" DROP COLUMN IF EXISTS "blockReason"`);
  }
}
