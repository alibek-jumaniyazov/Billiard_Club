import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * app_releases — desktop dastur o'rnatgichlarining katalogi.
 *
 * NEGA KERAK. Desktop qobiq shu paytgacha faqat qo'lda tarqatilardi:
 * kimdir `.exe` ni yasab, uni qandaydir yo'l bilan klubga yetkazishi kerak
 * edi va klubda qaysi versiya turgani hech kim bilmasdi. Endi:
 *  - Yuklab olish YAGONA manzilda: /download (versiya va sana ko'rinib turadi)
 *  - Auto-update AYNAN shu jadvaldan boqiladi (electron-updater feed)
 *  - Fayllar tashqi xizmatda emas, o'z serverimizda
 *
 * Binarning O'ZI diskda (RELEASES_DIR) — bazada faqat metama'lumot.
 *
 * UNIQUE (platform, version): bir platforma uchun bir versiya bir marta.
 * Aks holda "1.0.1" nomli ikkita har xil fayl yonma-yon yashab, auto-update
 * qaysi birini berishini tasodifga qoldirardi.
 *
 * UNIQUE (storedName): diskdagi nom ham takrorlanmaydi — yangi yuklash eski
 * faylni jimgina bosib ketmasin (o'rnatilgan mijozlarda sha512 mos kelmay
 * qolardi va ular yangilana olmasdi).
 */
export class AppReleases1784248100000 implements MigrationInterface {
  name = 'AppReleases1784248100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."app_releases_platform_enum" AS ENUM('win', 'mac', 'linux')`,
    );
    await queryRunner.query(`
      CREATE TABLE "app_releases" (
        "id" SERIAL NOT NULL,
        "version" character varying(30) NOT NULL,
        "platform" "public"."app_releases_platform_enum" NOT NULL,
        "fileName" character varying(255) NOT NULL,
        "storedName" character varying(255) NOT NULL,
        "size" bigint NOT NULL,
        "sha512" character varying(128) NOT NULL,
        "notesUz" text,
        "notesRu" text,
        "isPublished" boolean NOT NULL DEFAULT false,
        "publishedAt" TIMESTAMP WITH TIME ZONE,
        "downloads" integer NOT NULL DEFAULT 0,
        "uploadedById" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_releases" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_app_releases_storedName" UNIQUE ("storedName")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_app_releases_platform_version" ON "app_releases" ("platform", "version")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_app_releases_platform_published" ON "app_releases" ("platform", "isPublished", "publishedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_app_releases_platform_published"`);
    await queryRunner.query(`DROP INDEX "public"."uq_app_releases_platform_version"`);
    await queryRunner.query(`DROP TABLE "app_releases"`);
    await queryRunner.query(`DROP TYPE "public"."app_releases_platform_enum"`);
  }
}
