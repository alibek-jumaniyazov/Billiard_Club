import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Qarzni HISOBDAN CHIQARISH (write-off) — qattiq o'chirish o'rniga.
 *
 * MUAMMO: `DELETE /debts/:id` qatorni butunlay o'chirardi. Hisobotdagi
 * "yaratilgan qarzlar" (`debtsCreated`) esa jonli `debts` jadvalidan
 * `createdAt` oralig'i bo'yicha hisoblanadi — natijada IYUL hisoboti
 * avgustda va sentabrda TURLI raqam berardi. Moliyaviy hisobot o'zgarmas
 * (immutable) bo'lishi shart. Ikkinchi oqibat: qarzi hisobdan chiqarilgan
 * sessiya `isPaid = false` bo'lib qolib, Excel eksportning "To'langan"
 * ustunida abadiy "Yo'q" ko'rinardi.
 *
 * YECHIM: qator saqlanadi, `remainingDebt` nolga tushadi (barcha "joriy
 * qarz" yig'indilari — dashboard, mijoz profili, qarzlar sahifasi — aynan
 * shu ustundan hisoblanadi, shuning uchun ular o'zi to'g'ri bo'lib qoladi),
 * `isPaid` true bo'ladi, quyidagi ustunlar esa "nega va kim" savoliga
 * javob qoldiradi.
 *
 * Mavjud ma'lumotga ta'siri YO'Q: uchala ustun ham nullable, eski qatorlarda
 * NULL bo'lib qoladi (ya'ni "hisobdan chiqarilmagan").
 */
export class DebtWriteOff1784248000000 implements MigrationInterface {
  name = 'DebtWriteOff1784248000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "debts" ADD "writtenOffAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "debts" ADD "writtenOffReason" character varying(200)`);
    await queryRunner.query(`ALTER TABLE "debts" ADD "writtenOffById" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "debts" DROP COLUMN "writtenOffById"`);
    await queryRunner.query(`ALTER TABLE "debts" DROP COLUMN "writtenOffReason"`);
    await queryRunner.query(`ALTER TABLE "debts" DROP COLUMN "writtenOffAt"`);
  }
}
