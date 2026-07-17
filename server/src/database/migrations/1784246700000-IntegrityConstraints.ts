import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DB darajasidagi moliyaviy yaxlitlik — ilova kodi chetlab o'tilsa ham
 * (bug, raw SQL, poyga holati) noto'g'ri ma'lumot yozilishining oldini oladi:
 *
 *  - CHECK: manfiy summalar va 1 dan kichik miqdorlar taqiqlanadi
 *  - Bitta stolda bir vaqtda faqat bitta faol/pauzadagi sessiya
 *  - Bitta sessiyada faqat bitta ochiq buyurtma
 *  - Klub ichida unikal: stol raqami, kategoriya nomi, mahsulot nomi (faollar uchun)
 */
export class IntegrityConstraints1784246700000 implements MigrationInterface {
  name = 'IntegrityConstraints1784246700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // CHECK cheklovlari
    await queryRunner.query(`
      ALTER TABLE "sessions" ADD CONSTRAINT "chk_sessions_amounts_nonneg"
      CHECK ("tableAmount" >= 0 AND "barAmount" >= 0 AND "totalAmount" >= 0 AND "totalPausedMs" >= 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_items_valid"
      CHECK ("quantity" >= 1 AND "price" >= 0 AND "subtotal" >= 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "products" ADD CONSTRAINT "chk_products_valid"
      CHECK ("price" >= 0 AND "stock" >= 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_amounts_nonneg"
      CHECK ("tableAmount" >= 0 AND "barAmount" >= 0 AND "totalAmount" >= 0 AND "discount" >= 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "debts" ADD CONSTRAINT "chk_debts_amounts_nonneg"
      CHECK ("tableAmount" >= 0 AND "barAmount" >= 0 AND "totalDebt" >= 0 AND "paidAmount" >= 0 AND "remainingDebt" >= 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_amount_nonneg"
      CHECK ("totalAmount" >= 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "debt_payments" ADD CONSTRAINT "chk_debt_payments_positive"
      CHECK ("amount" > 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "tables" ADD CONSTRAINT "chk_tables_price_nonneg"
      CHECK ("pricePerHour" >= 0)
    `);

    // Poyga holatlaridan DB darajasida himoya
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_sessions_one_active_per_table"
      ON "sessions" ("tableId") WHERE "status" IN ('active', 'paused')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_orders_one_open_per_session"
      ON "orders" ("sessionId") WHERE "status" = 'open' AND "sessionId" IS NOT NULL
    `);

    // Klub ichidagi unikallik (faol yozuvlar uchun)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_tables_club_number_active"
      ON "tables" ("clubId", "number") WHERE "isActive" = true
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_categories_club_name_active"
      ON "categories" ("clubId", "name") WHERE "isActive" = true
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_products_club_cat_name_active"
      ON "products" ("clubId", "categoryId", "name") WHERE "isActive" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_products_club_cat_name_active"`);
    await queryRunner.query(`DROP INDEX "uq_categories_club_name_active"`);
    await queryRunner.query(`DROP INDEX "uq_tables_club_number_active"`);
    await queryRunner.query(`DROP INDEX "uq_orders_one_open_per_session"`);
    await queryRunner.query(`DROP INDEX "uq_sessions_one_active_per_table"`);
    await queryRunner.query(`ALTER TABLE "tables" DROP CONSTRAINT "chk_tables_price_nonneg"`);
    await queryRunner.query(`ALTER TABLE "debt_payments" DROP CONSTRAINT "chk_debt_payments_positive"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "chk_orders_amount_nonneg"`);
    await queryRunner.query(`ALTER TABLE "debts" DROP CONSTRAINT "chk_debts_amounts_nonneg"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT "chk_sales_amounts_nonneg"`);
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "chk_products_valid"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "chk_order_items_valid"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP CONSTRAINT "chk_sessions_amounts_nonneg"`);
  }
}
