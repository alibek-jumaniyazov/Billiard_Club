import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stol chiroqlarini boshqarish (opt-in imkoniyat) uchun sxema.
 *
 * Chiroq holati alohida buyruq navbatisiz, DB dagi "kerakli holat" (desired
 * state) dan kelib chiqadi: stolda active sessiya bor -> yoniq, sessiya yo'q ->
 * o'chiq, pauzada esa settings."lightOffOnPause" hal qiladi. Qo'lda boshqaruv
 * (lightOverrideOn + lightOverrideUntil) muddati tugagunicha ustun turadi.
 *
 * Bulut server klubning lokal tarmog'iga (NAT ortiga) chiqa olmagani uchun
 * ikki rejim bor: 'bridge' — klubdagi kichik Node agent serverga o'zi ulanadi
 * (club_bridges jadvali, sha256 tokeni bilan), 'direct' — server relega o'zi
 * murojaat qiladi. Standart rejim 'off' — mavjud klublarda hech nima o'zgarmaydi.
 *
 * Barcha yangi ustunlar default yoki nullable — mavjud yozuvlar buzilmaydi.
 */
export class TableLightControl1784247400000 implements MigrationInterface {
  name = 'TableLightControl1784247400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- Yangi enum turlari ----------
    await queryRunner.query(
      `CREATE TYPE "public"."light_driver" AS ENUM('none', 'shelly_gen1', 'shelly_gen2', 'tasmota', 'http')`,
    );
    await queryRunner.query(`CREATE TYPE "public"."light_mode" AS ENUM('off', 'bridge', 'direct')`);

    // ---------- tables: rele sozlamalari + qo'lda boshqaruv + oxirgi holat ----------
    await queryRunner.query(
      `ALTER TABLE "tables" ADD "lightDriver" "public"."light_driver" NOT NULL DEFAULT 'none'`,
    );
    await queryRunner.query(`ALTER TABLE "tables" ADD "lightHost" character varying(120)`);
    await queryRunner.query(`ALTER TABLE "tables" ADD "lightChannel" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "tables" ADD "lightInverted" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "tables" ADD "lightAuth" character varying(200)`);
    await queryRunner.query(`ALTER TABLE "tables" ADD "lightOnUrl" text`);
    await queryRunner.query(`ALTER TABLE "tables" ADD "lightOffUrl" text`);
    await queryRunner.query(`ALTER TABLE "tables" ADD "lightOverrideOn" boolean`);
    await queryRunner.query(`ALTER TABLE "tables" ADD "lightOverrideUntil" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "tables" ADD "lightState" boolean`);
    await queryRunner.query(`ALTER TABLE "tables" ADD "lightSyncedAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "tables" ADD "lightError" character varying(300)`);
    await queryRunner.query(`
      ALTER TABLE "tables" ADD CONSTRAINT "chk_tables_light_channel_nonneg"
      CHECK ("lightChannel" >= 0)
    `);

    // ---------- settings: klub bo'yicha rejim va pauza xatti-harakati ----------
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "lightMode" "public"."light_mode" NOT NULL DEFAULT 'off'`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "lightOffOnPause" boolean NOT NULL DEFAULT false`,
    );

    // ---------- club_bridges ----------
    await queryRunner.query(`
      CREATE TABLE "club_bridges" (
        "id" SERIAL NOT NULL,
        "clubId" integer NOT NULL,
        "name" character varying(100) NOT NULL DEFAULT 'Asosiy bridge',
        "tokenHash" character varying(64) NOT NULL,
        "lastSeenAt" TIMESTAMP WITH TIME ZONE,
        "agentVersion" character varying(30),
        "lastIp" character varying(60),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_club_bridges" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_club_bridges_clubId" UNIQUE ("clubId"),
        CONSTRAINT "UQ_club_bridges_tokenHash" UNIQUE ("tokenHash"),
        CONSTRAINT "FK_club_bridges_club" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "club_bridges"`);

    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "lightOffOnPause"`);
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "lightMode"`);

    await queryRunner.query(`ALTER TABLE "tables" DROP CONSTRAINT "chk_tables_light_channel_nonneg"`);
    await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "lightError"`);
    await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "lightSyncedAt"`);
    await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "lightState"`);
    await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "lightOverrideUntil"`);
    await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "lightOverrideOn"`);
    await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "lightOffUrl"`);
    await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "lightOnUrl"`);
    await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "lightAuth"`);
    await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "lightInverted"`);
    await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "lightChannel"`);
    await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "lightHost"`);
    await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "lightDriver"`);

    await queryRunner.query(`DROP TYPE "public"."light_mode"`);
    await queryRunner.query(`DROP TYPE "public"."light_driver"`);
  }
}
