import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * cash_shifts — kassa smenalari (ochish/yopish va Z-hisobot).
 *
 * Qisman UNIQUE indeks: bitta klubda faqat bitta ochiq smena ("closedAt" IS NULL).
 * Ikki kassir bir vaqtda "Smenani ochish" ni bossa, ikkinchisi DB darajasida
 * rad etiladi — dastur tekshiruviga tayanib qolinmaydi.
 */
export class CashShifts1784248700000 implements MigrationInterface {
  name = 'CashShifts1784248700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cash_shifts" (
        "id" SERIAL NOT NULL,
        "clubId" integer NOT NULL,
        "openedById" integer,
        "openedByName" character varying(100),
        "openedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "openingCash" numeric(14,2) NOT NULL DEFAULT 0,
        "openingNote" text,
        "closedById" integer,
        "closedByName" character varying(100),
        "closedAt" TIMESTAMP WITH TIME ZONE,
        "cashOut" numeric(14,2),
        "expectedCash" numeric(14,2),
        "countedCash" numeric(14,2),
        "difference" numeric(14,2),
        "closingNote" text,
        "summary" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_shifts" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_cash_shifts_amounts" CHECK (
          "openingCash" >= 0
          AND ("cashOut" IS NULL OR "cashOut" >= 0)
          AND ("countedCash" IS NULL OR "countedCash" >= 0)
        ),
        CONSTRAINT "FK_cash_shifts_club" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cash_shifts_openedBy" FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cash_shifts_closedBy" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_shifts_club_openedAt" ON "cash_shifts" ("clubId", "openedAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_cash_shifts_open_per_club" ON "cash_shifts" ("clubId") WHERE "closedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."uq_cash_shifts_open_per_club"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cash_shifts_club_openedAt"`);
    await queryRunner.query(`DROP TABLE "cash_shifts"`);
  }
}
