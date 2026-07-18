import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hisob-fakturaga tarif davomiyligini (durationDays) MUHRLASH.
 *
 * Avval confirmInvoice() obuna tugash sanasini tarifning JORIY durationDays iga
 * qarab hisoblardi — so'rov (PENDING) va tasdiqlash oralig'ida superadmin tarif
 * muddatini o'zgartirsa, klub sotib olgan muddatdan farqli muddat olishi mumkin
 * edi. Endi muddat xarid paytida fakturaga muhrlanadi. Eski fakturalarda ustun
 * null — bu holda tasdiqlash avvalgidek tarifning joriy qiymatiga tayanadi.
 */
export class InvoiceDurationSnapshot1784247300000 implements MigrationInterface {
  name = 'InvoiceDurationSnapshot1784247300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" ADD "durationDays" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "durationDays"`);
  }
}
