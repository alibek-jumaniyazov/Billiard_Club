import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * KLUB EGASI UCHUN TELEGRAM BOT.
 *
 *  - owner_telegram_chats — klubga ulangan Telegram chatlar (egasining shaxsiy chati
 *    yoki sheriklar guruhi). Har chat o'z sozlamalariga ega: kunlik hisobot vaqti,
 *    haftalik/oylik yakun, darhol xabarlar (bekor qilingan o'yin, chegirma, smena...).
 *    `lastReportDate` — klub vaqti bo'yicha oxirgi kunlik hisobot yuborilgan SANA:
 *    hisobot kuniga bir marta ketadi (server qayta ishga tushsa ham).
 *  - owner_telegram_link_tokens — ilovadagi «Ulash» tugmasi beradigan bir martalik,
 *    15 daqiqalik havola. Bazada faqat HASH saqlanadi.
 *
 * Mavjud ma'lumotga tegilmaydi — yangi jadvallar.
 */
export class OwnerTelegram1784249600000 implements MigrationInterface {
  name = 'OwnerTelegram1784249600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "owner_telegram_chats" (
        "id" SERIAL PRIMARY KEY,
        "clubId" integer NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
        "chatId" varchar(32) NOT NULL,
        "chatType" varchar(16) NOT NULL DEFAULT 'private',
        "title" varchar(128),
        "linkedById" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "inactiveReason" varchar(16),
        "lang" varchar(2) NOT NULL DEFAULT 'uz',
        "dailyReport" boolean NOT NULL DEFAULT true,
        "reportTime" varchar(5) NOT NULL DEFAULT '09:00',
        "periodReports" boolean NOT NULL DEFAULT true,
        "alerts" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "lastReportDate" date,
        "lastSentAt" timestamptz,
        "lastError" varchar(255),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_owner_telegram_chats_club_chat" UNIQUE ("clubId", "chatId"),
        CONSTRAINT "chk_owner_telegram_chats_lang" CHECK ("lang" IN ('uz', 'ru')),
        CONSTRAINT "chk_owner_telegram_chats_report_time" CHECK ("reportTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_owner_telegram_chats_chat" ON "owner_telegram_chats" ("chatId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_owner_telegram_chats_due" ON "owner_telegram_chats" ("clubId")
         WHERE "isActive" = true`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "owner_telegram_link_tokens" (
        "tokenHash" varchar(64) PRIMARY KEY,
        "clubId" integer NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
        "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "lang" varchar(2) NOT NULL DEFAULT 'uz',
        "expiresAt" timestamptz NOT NULL,
        "usedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_owner_telegram_link_tokens_expires" ON "owner_telegram_link_tokens" ("expiresAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "owner_telegram_link_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "owner_telegram_chats"`);
  }
}
