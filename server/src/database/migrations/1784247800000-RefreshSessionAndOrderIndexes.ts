import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ikkita yetishmagan indeks.
 *
 * 1) refresh_sessions."expiresAt".
 *    Jadval hech qachon tozalanmasdi: har bir login va har bir token
 *    rotatsiyasi (klientda har 15 daqiqada) yangi qator qo'shadi, eskisi
 *    esa faqat "revoked" deb belgilanadi. Bir yilda yuz minglab qator.
 *    Endi AuthService da kunlik cron 7 kundan eski (muddati o'tgan)
 *    yozuvlarni bo'laklab o'chiradi — u AYNAN "expiresAt" bo'yicha
 *    filtrlaydi, indekssiz har kecha to'liq seq-scan bo'lardi.
 *
 * 2) orders ("clubId", "createdAt").
 *    Buyurtmalar ro'yxati va kunlik hisobotlar doim klub + sana oynasi
 *    bo'yicha so'raydi, jadvalda esa faqat bir ustunli indekslar bor edi.
 *    DESC — ro'yxat "eng yangisi birinchi" tartibida chiqadi.
 */
export class RefreshSessionAndOrderIndexes1784247800000 implements MigrationInterface {
  name = 'RefreshSessionAndOrderIndexes1784247800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_sessions_expiresAt" ON "refresh_sessions" ("expiresAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_club_createdAt" ON "orders" ("clubId", "createdAt" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_orders_club_createdAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_refresh_sessions_expiresAt"`);
  }
}
