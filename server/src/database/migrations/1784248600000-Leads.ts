import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * leads — landing'dagi "bepul konsultatsiya" arizalari.
 *
 * Ro'yxatdan o'tishga hali tayyor bo'lmagan klub egasi faqat ism va telefon
 * qoldiradi; ariza shu yerga yoziladi va platforma egasiga Telegram orqali
 * yetkaziladi. Telegram sozlanmagan yoki vaqtincha ishlamagan bo'lsa ham
 * ariza YO'QOLMAYDI — superadmin panelida ko'rinib turadi.
 */
export class Leads1784248600000 implements MigrationInterface {
  name = 'Leads1784248600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'converted', 'rejected')`,
    );
    await queryRunner.query(`
      CREATE TABLE "leads" (
        "id" SERIAL NOT NULL,
        "name" character varying(80) NOT NULL,
        "phone" character varying(32) NOT NULL,
        "clubName" character varying(120),
        "tablesCount" integer,
        "message" text,
        "lang" character varying(2),
        "source" character varying(30) NOT NULL DEFAULT 'landing',
        "status" "public"."lead_status" NOT NULL DEFAULT 'new',
        "note" text,
        "ip" character varying(64),
        "userAgent" character varying(300),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leads" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_leads_tablesCount" CHECK ("tablesCount" IS NULL OR "tablesCount" BETWEEN 1 AND 500)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_leads_status_createdAt" ON "leads" ("status", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_leads_status_createdAt"`);
    await queryRunner.query(`DROP TABLE "leads"`);
    await queryRunner.query(`DROP TYPE "public"."lead_status"`);
  }
}
