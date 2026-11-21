import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * YANGI RELE TURLARI (chiroq markazi uchun): Tuya / Smart Life, Sonoff (eWeLink
 * LAN/DIY), RS485 Modbus RTU platalar va "USBRelay" HID platalar.
 *
 * `light_driver` enumi ALMASHTIRISH usulida kengaytiriladi (1784247700000-LightControlPro
 * bilan bir xil): `ALTER TYPE ... ADD VALUE` eski PostgreSQL versiyalarida
 * tranzaksiya ichida ishlamaydi, almashtirish esa har qanday versiyada xavfsiz.
 *
 * Yangi ustun yo'q: drayverga xos maydonlar `lightConfig` (jsonb) ichida,
 * Tuya lokal kaliti va Sonoff devicekey esa mavjud `lightAuth` ustunida
 * (`select: false`, panelga hech qachon qaytmaydi).
 */
const OLD_VALUES = [
  'none', 'shelly_gen1', 'shelly_gen2', 'tasmota', 'esphome',
  'home_assistant', 'mqtt', 'tcp', 'modbus_tcp', 'serial', 'http',
];
const NEW_VALUES = [...OLD_VALUES, 'tuya', 'sonoff', 'modbus_rtu', 'usb_hid'];

async function replaceEnum(queryRunner: QueryRunner, values: string[]): Promise<void> {
  const list = values.map((value) => `'${value}'`).join(', ');
  await queryRunner.query(`ALTER TYPE "public"."light_driver" RENAME TO "light_driver_old"`);
  await queryRunner.query(`CREATE TYPE "public"."light_driver" AS ENUM(${list})`);
  // DEFAULT eski turga bog'langani uchun avval olib tashlanadi, keyin qaytariladi
  await queryRunner.query(`ALTER TABLE "tables" ALTER COLUMN "lightDriver" DROP DEFAULT`);
  await queryRunner.query(`
    ALTER TABLE "tables" ALTER COLUMN "lightDriver"
    TYPE "public"."light_driver" USING "lightDriver"::text::"public"."light_driver"
  `);
  await queryRunner.query(`ALTER TABLE "tables" ALTER COLUMN "lightDriver" SET DEFAULT 'none'`);
  await queryRunner.query(`DROP TYPE "public"."light_driver_old"`);
}

export class LightDriversLocalHub1784249400000 implements MigrationInterface {
  name = 'LightDriversLocalHub1784249400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Qayta ishga tushirilsa (yoki qiymatlar allaqachon bo'lsa) — hech narsa qilmaymiz
    const rows: Array<{ value: string }> = await queryRunner.query(
      `SELECT e.enumlabel AS value FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'light_driver'`,
    );
    const present = new Set(rows.map((row) => row.value));
    if (NEW_VALUES.every((value) => present.has(value))) return;
    await replaceEnum(queryRunner, NEW_VALUES);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Yangi turdagi stollar avval "ulanmagan" holatga o'tkaziladi — aks holda
    // eski enumga o'girish xato beradi
    await queryRunner.query(
      `UPDATE "tables" SET "lightDriver" = 'none' WHERE "lightDriver"::text IN ('tuya', 'sonoff', 'modbus_rtu', 'usb_hid')`,
    );
    await replaceEnum(queryRunner, OLD_VALUES);
  }
}
