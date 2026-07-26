import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * order_items."createdAt" uchun indeks.
 *
 * Bugungi bar savdosi (orders.todayStats) pozitsiyalarni O'Z vaqti bo'yicha
 * filtrlaydi: `oi."createdAt" >= :dayStart AND oi."createdAt" <= :now`.
 * Jadvalda esa faqat ("orderId") va ("productId") indekslari bor edi — sxemadagi
 * eng tez o'sadigan jadval Buyurtmalar sahifasi har ochilganda to'liq skanerdan
 * o'tardi. Indeks bir kunlik oynani darhol kesib beradi.
 */
export class OrderItemsCreatedAtIndex1784247500000 implements MigrationInterface {
  name = 'OrderItemsCreatedAtIndex1784247500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_order_items_createdAt" ON "order_items" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_order_items_createdAt"`);
  }
}
