import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * idempotency_keys — takroriy mutatsiyalardan himoya.
 *
 * MUAMMO. Klientning oflayn navbati har bir amalga `Idempotency-Key`
 * sarlavhasini qo'yadi va javob kelmasa amalni QAYTA yuboradi. Server bu
 * sarlavhani umuman o'qimasdi: so'rov serverga yetib borgan, faqat javob
 * yo'lda yo'qolgan holatda qayta yuborish pulni ikki marta yozardi.
 *
 * YECHIM. IdempotencyInterceptor kalitni amal BAJARILISHIDAN OLDIN band
 * qiladi (unique indeks hisobiga atomik), amal tugagach javobni shu qatorga
 * yozadi va o'sha kalit qaytib kelsa handler ni bajarmasdan saqlangan javobni
 * qaytaradi. "Oldin band qilish" shart: aks holda bir vaqtda kelgan ikkita
 * bir xil so'rov IKKALASI HAM bajarilib, pul ikki marta yozilardi.
 * `responseStatus IS NULL` — kalit band, amal hali tugamagan.
 *
 * UNIQUE (key, userId) — kalitni klient generatsiya qilgani uchun u
 * foydalanuvchi doirasida ajratiladi (birovning kaliti bilan uning javobini
 * olib bo'lmaydi). Shu indeks poyga holatida ham yagona haqiqat manbai:
 * ikki parallel so'rovdan biri unique xatoga uchraydi va saqlangan javobni
 * o'qib qaytaradi.
 *
 * ("createdAt") indeksi — 48 soatdan eski kalitlarni o'chiradigan kunlik
 * cron uchun (seq-scan bo'lmasin).
 *
 * FK ataylab yo'q (audit_logs bilan bir xil qoida) — bu vaqtinchalik
 * texnik jadval, u hech qanday yozuvni ushlab turmasligi kerak.
 */
export class IdempotencyKeys1784247900000 implements MigrationInterface {
  name = 'IdempotencyKeys1784247900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "id" SERIAL NOT NULL,
        "key" character varying(100) NOT NULL,
        "userId" integer NOT NULL,
        "clubId" integer,
        "method" character varying(10) NOT NULL,
        "path" character varying(500) NOT NULL,
        "responseStatus" integer,
        "responseBody" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_idempotency_keys" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_idempotency_keys_key_user" ON "idempotency_keys" ("key", "userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_idempotency_keys_createdAt" ON "idempotency_keys" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_idempotency_keys_createdAt"`);
    await queryRunner.query(`DROP INDEX "public"."uq_idempotency_keys_key_user"`);
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
  }
}
