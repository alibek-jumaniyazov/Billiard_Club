import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * club_notifications: e'lonlarni GURUHLASH uchun "batchId" + yetishmagan indekslar.
 *
 * MUAMMO. Global e'lon har bir klubga alohida yozuv sifatida tarqatiladi
 * (fan-out), lekin yagona guruh identifikatori yo'q edi. Shu sababli
 * superadmin tarixida bitta e'lon N ta bir xil qatorga aylanardi: 300 ta
 * klubli platformada bitta e'lon 15 ta sahifani to'ldirib, undan oldingi
 * barcha yuborishlarni ko'mib tashlardi. Bitta e'lon nechta klubga borgani
 * va nechtasi o'qigani ham umuman hisoblab bo'lmasdi.
 *
 * YECHIM. "batchId" uuid NOT NULL — bitta yuborishning barcha yozuvlarida
 * bir xil qiymat. Ustunda DB DEFAULT bor, shuning uchun batchId ni
 * BERMAYDIGAN mavjud ishlab chiqaruvchi — FeedbackService.reply — hech
 * qanday o'zgarishsiz ishlashda davom etadi va uning yozuvi tabiiy ravishda
 * bitta qabul qiluvchili "batch" bo'lib ko'rinadi. gen_random_uuid() PG13+
 * talab qilgani uchun kengaytmaga bog'liq bo'lmagan md5(...)::uuid tanlandi.
 *
 * BACKFILL. Mavjud qatorlar (title, body, type, createdById + sekundgacha
 * yaxlitlangan createdAt) dan deterministik md5 uuid oladi — bitta fan-out
 * ning barcha qatorlari bir xil qiymatga tushadi, chunki INSERT ichida
 * now() statement-stable. Bir sekund ichida yuborilgan AYNAN bir xil ikkita
 * e'lon bitta guruhga qo'shilib ketadi; bu ataylab qabul qilingan murosa
 * (oqibati kosmetik: tarixda ikki qator o'rniga bitta qator).
 *
 * INDEKSLAR. Ilgari faqat ("clubId","readAt") bor edi, ikkala issiq so'rov
 * esa createdAt bo'yicha saralaydi: klub ro'yxati (qo'ng'iroq har 60 s da
 * so'raydi) va admin tarixi (butun jadval bo'ylab seq-scan + sort). Qo'shildi:
 * ("clubId","createdAt") — klub ro'yxati; ("createdAt") — admin tarixi;
 * ("batchId") — guruhlash, drill-down va qaytarib olish (recall).
 */
export class ClubNotificationBatchId1784247600000 implements MigrationInterface {
  name = 'ClubNotificationBatchId1784247600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- batchId ustuni ----------
    await queryRunner.query(`ALTER TABLE "club_notifications" ADD "batchId" uuid`);

    await queryRunner.query(`
      UPDATE "club_notifications"
      SET "batchId" = md5(
        coalesce("title", '') || '|' ||
        coalesce("body", '') || '|' ||
        coalesce("type", '') || '|' ||
        coalesce("createdById"::text, '') || '|' ||
        date_trunc('second', "createdAt")::text
      )::uuid
      WHERE "batchId" IS NULL
    `);

    // NOT NULL faqat backfilldan KEYIN — mavjud qatorda hech qachon yiqilmaydi
    await queryRunner.query(
      `ALTER TABLE "club_notifications" ALTER COLUMN "batchId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_notifications" ALTER COLUMN "batchId" SET DEFAULT md5(random()::text || clock_timestamp()::text)::uuid`,
    );

    // ---------- indekslar ----------
    await queryRunner.query(
      `CREATE INDEX "IDX_club_notifications_batchId" ON "club_notifications" ("batchId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_club_notifications_club_createdAt" ON "club_notifications" ("clubId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_club_notifications_createdAt" ON "club_notifications" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_club_notifications_createdAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_club_notifications_club_createdAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_club_notifications_batchId"`);
    await queryRunner.query(`ALTER TABLE "club_notifications" DROP COLUMN "batchId"`);
  }
}
