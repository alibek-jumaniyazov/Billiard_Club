import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * STOLSIZ BAR SAVDOSI — billiard o'ynamaydigan mijozga bardan to'g'ridan-to'g'ri sotish.
 *
 * Pul yozuvlari o'yin hisob-kitobi bilan BIR XIL jadvallarda qoladi — tushum,
 * to'lov usullari, smena (Z-hisobot) va Telegram hisobotlari uni alohida
 * birlashtirishsiz ko'radi:
 *  - `sales.sessionId` ixtiyoriy bo'ldi, `sales.orderId` qo'shildi: sotuv yo o'yinga,
 *    yo stolsiz buyurtmaga tegishli — aynan bittasiga (chk_sales_source);
 *  - `session_payments.sessionId` ixtiyoriy: stolsiz savdoning to'lov satrlari
 *    sotuvga (`saleId`) bog'lanadi — egasiz to'lov satri bo'lmaydi;
 *  - `orders` ga mijoz (`customerId`, `customerName`): stolsiz xarid mijoz
 *    profilida va chekda ko'rinadi.
 */
export class WalkInBarSales1784249900000 implements MigrationInterface {
  name = 'WalkInBarSales1784249900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // sales: o'yin YOKI stolsiz buyurtma
    await queryRunner.query(`ALTER TABLE "sales" ALTER COLUMN "sessionId" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "orderId" integer`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sales_orderId" ON "sales" ("orderId")`);
    await queryRunner.query(
      `ALTER TABLE "sales" ADD CONSTRAINT "FK_sales_order" FOREIGN KEY ("orderId") ` +
        `REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales" ADD CONSTRAINT "chk_sales_source" ` +
        `CHECK ((("sessionId" IS NOT NULL)::int + ("orderId" IS NOT NULL)::int) = 1)`,
    );

    // session_payments: stolsiz savdo satri o'yinsiz, lekin sotuvsiz emas
    await queryRunner.query(`ALTER TABLE "session_payments" ALTER COLUMN "sessionId" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "session_payments" ADD CONSTRAINT "chk_session_payments_source" ` +
        `CHECK ("sessionId" IS NOT NULL OR "saleId" IS NOT NULL)`,
    );

    // orders: stolsiz xaridning mijozi
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customerId" integer`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customerName" character varying(100)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_orders_customerId" ON "orders" ("customerId")`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_customer" FOREIGN KEY ("customerId") ` +
        `REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Stolsiz savdolar eski sxemaga sig'maydi (sessionId NOT NULL) — avval ular olib tashlanadi
    await queryRunner.query(`DELETE FROM "session_payments" WHERE "sessionId" IS NULL`);
    await queryRunner.query(`DELETE FROM "sales" WHERE "sessionId" IS NULL`);

    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_customer"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_customerId"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "customerName"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "customerId"`);

    await queryRunner.query(`ALTER TABLE "session_payments" DROP CONSTRAINT IF EXISTS "chk_session_payments_source"`);
    await queryRunner.query(`ALTER TABLE "session_payments" ALTER COLUMN "sessionId" SET NOT NULL`);

    await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "chk_sales_source"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "FK_sales_order"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_sales_orderId"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "orderId"`);
    await queryRunner.query(`ALTER TABLE "sales" ALTER COLUMN "sessionId" SET NOT NULL`);
  }
}
