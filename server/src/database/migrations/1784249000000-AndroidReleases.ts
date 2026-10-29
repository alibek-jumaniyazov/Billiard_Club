import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * app_releases.platform ga 'android' qo'shiladi — superadmin APK ni yuklaydi,
 * /download sahifasi Android telefonga uni taklif qiladi.
 *
 * ADD VALUE PostgreSQL 12+ da tranzaksiya ichida ishlaydi (yangi qiymat shu
 * tranzaksiyaning o'zida ishlatilmaydi — bu yerda ishlatilmaydi ham).
 */
export class AndroidReleases1784249000000 implements MigrationInterface {
  name = 'AndroidReleases1784249000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."app_releases_platform_enum" ADD VALUE IF NOT EXISTS 'android'`,
    );
  }

  /**
   * Enum qiymatini o'chirib bo'lmaydi — tur qayta yaratiladi. Android
   * relizlari (yozuvlar) o'chiriladi; diskdagi fayllarga tegilmaydi.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "app_releases" WHERE "platform" = 'android'`);
    await queryRunner.query(
      `ALTER TYPE "public"."app_releases_platform_enum" RENAME TO "app_releases_platform_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."app_releases_platform_enum" AS ENUM('win', 'mac', 'linux')`,
    );
    await queryRunner.query(
      `ALTER TABLE "app_releases" ALTER COLUMN "platform" TYPE "public"."app_releases_platform_enum"
         USING "platform"::text::"public"."app_releases_platform_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."app_releases_platform_enum_old"`);
  }
}
