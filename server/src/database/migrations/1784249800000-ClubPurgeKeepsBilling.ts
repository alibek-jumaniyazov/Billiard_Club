import { MigrationInterface, QueryRunner } from 'typeorm';

/** Platforma to'lov tarixi jadvallari — klub o'chirilganda saqlanadi */
const BILLING_TABLES = ['contracts', 'invoices'] as const;

/**
 * Klubni ma'lumotlari bilan to'liq o'chirish (superadmin) — platforma to'lov tarixi SAQLANADI.
 *
 * Shartnoma va to'langan faktura — platforma daromadining yozuvi. Klub o'chirilganda ular
 * yo'qolsa daromad statistikasi kamayib, faktura raqamlari qayta ishlatilishi mumkin edi.
 * Shu bois `clubId` endi ixtiyoriy, FK `ON DELETE SET NULL` (avval CASCADE edi), o'chirish
 * paytida klub nomi `clubName` ga muhrlanadi: tarixda "o'chirilgan klub" sifatida ko'rinadi.
 *
 * FK nomi muhitga bog'liq bo'lishi mumkin — shuning uchun clubs ga ishora qiluvchi
 * barcha FK lar katalogdan topilib almashtiriladi (eski CASCADE qolib ketmasin).
 */
export class ClubPurgeKeepsBilling1784249800000 implements MigrationInterface {
  name = 'ClubPurgeKeepsBilling1784249800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of BILLING_TABLES) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "clubName" character varying(150)`);
      await this.dropClubForeignKeys(queryRunner, table);
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "clubId" DROP NOT NULL`);
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "FK_${table}_club" FOREIGN KEY ("clubId") ` +
          `REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Fakturalar avval: ular shartnomaga ishora qiladi (contractId SET NULL)
    for (const table of [...BILLING_TABLES].reverse()) {
      // O'chirilgan klublarning tarix yozuvlari eski sxemaga sig'maydi (clubId NOT NULL)
      await queryRunner.query(`DELETE FROM "${table}" WHERE "clubId" IS NULL`);
      await this.dropClubForeignKeys(queryRunner, table);
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "clubId" SET NOT NULL`);
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "FK_${table}_club" FOREIGN KEY ("clubId") ` +
          `REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "clubName"`);
    }
  }

  /** Jadvaldan clubs(id) ga ishora qiluvchi barcha FK larni (nomidan qat'i nazar) olib tashlaydi */
  private async dropClubForeignKeys(queryRunner: QueryRunner, table: string): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT conname FROM pg_constraint
        WHERE contype = 'f' AND conrelid = $1::regclass AND confrelid = 'clubs'::regclass`,
      [table],
    )) as Array<{ conname: string }>;
    for (const { conname } of rows) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${conname.replace(/"/g, '""')}"`);
    }
  }
}
