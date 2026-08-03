import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chiroq boshqaruvining "PRO" bosqichi: yangi drayverlar, professional
 * vaqt qoidalari va diagnostika jurnali.
 *
 * 1) YANGI DRAYVERLAR. Ilgari faqat Shelly/Tasmota/umumiy HTTP bor edi —
 *    ya'ni klub relesi majburan HTTP qurilma bo'lishi kerak edi. Endi
 *    ESPHome va Home Assistant (server ham, agent ham bajara oladi), hamda
 *    faqat agent (bridge) bajaradigan MQTT/Zigbee2MQTT, xom TCP, Modbus/TCP
 *    va USB (serial) rele qo'shildi. Qaysi drayver qayerda ishlashi kodda
 *    SERVER_CAPABLE_DRIVERS / BRIDGE_ONLY_DRIVERS ro'yxatlari bilan belgilanadi.
 *
 *    Enum kengaytirish uchun `ALTER TYPE ... ADD VALUE` ISHLATILMAYDI: TypeORM
 *    migratsiyani TRANZAKSIYA ichida bajaradi, PostgreSQL da esa tranzaksiya
 *    ichida qo'shilgan enum qiymatini o'sha tranzaksiyada ishlatib bo'lmaydi
 *    (PG12 gacha umuman taqiqlangan). Shuning uchun ishonchli "almashtirish"
 *    usuli qo'llanadi: eski tur nomi o'zgartiriladi -> yangi tur yaratiladi ->
 *    ustun `::text::` orqali o'tkaziladi -> eski tur o'chiriladi.
 *
 * 2) tables."lightConfig" (jsonb). Har bir drayverning o'z maydonlari bor
 *    (HA `entityId`, ESPHome `entity`, MQTT `topic`, Modbus `coil`, TCP baytlari,
 *    qo'shimcha rele kanallari...). Ularning har biriga alohida ustun ochish
 *    jadvalni bo'sh ustunlar bilan to'ldirardi, shuning uchun bitta jsonb.
 *    Entityda `select: false` — lokal tarmoq tafsilotlari oddiy stol/sessiya
 *    javoblariga chiqmaydi (lightHost/lightAuth bilan bir xil qoida).
 *
 * 3) settings: 4 ta yangi sozlama.
 *    - lightOffDelaySec  (0..3600) — sessiya tugagach chiroq shuncha soniya
 *      yoniq qoladi: mijoz turgan zahoti zal qorong'i bo'lib qolmasin.
 *    - lightPreOnMinutes (0..120)  — bron boshlanishidan shuncha daqiqa oldin
 *      yoqiladi: mehmon kelganda stol tayyor bo'ladi.
 *    - lightForceSyncSec (10..3600) — majburiy qayta qo'llash oralig'i; rele
 *      elektr uzilishidan keyin boshqa holatga tushib qolsa, o'zi tiklanadi.
 *    - lightVerify (bool) — qurilmadan haqiqiy holatni o'qib tekshirish.
 *    Chegaralar DTO da ham, DB da ham (CHECK) qo'yiladi — DB oxirgi himoya.
 *
 * 4) table_light_events — diagnostika jurnali ("nega bu stolda chiroq
 *    yonmadi?"). Yozuv faqat MA'NOLI hodisada qo'shiladi (holat o'zgardi,
 *    xato, qo'lda aralashuv), har bir sinxronizatsiyada emas. Saqlash muddati
 *    30 kun — kunlik cron tozalaydi. Indekslar "eng yangisi birinchi" tartibida.
 *    ("at") bo'yicha alohida indeks — kunlik tozalash seq scan qilmasin.
 *
 * 5) sessions ustidagi QISMAN indeks. Kerakli holat so'rovi grace uchun oxirgi
 *    YAKUNLANGAN sessiyani izlaydi (LATERAL ... ORDER BY "endTime" DESC LIMIT 1)
 *    va bu so'rov uzun-polling ichida sekundlab bajariladi. Indeks faqat
 *    'completed'/'cancelled' qatorlarni qamrab oladi — jadval hajmiga nisbatan
 *    kichik bo'ladi, lekin LATERAL ni bir zumda bajaradi.
 *
 * 6) club_bridges: agentga beriladigan vazifa navbati va oxirgi qidiruv natijasi.
 *    Ilgari ular faqat jarayon XOTIRASIDA edi — ko'p instansiyali deployda
 *    vazifa boshqa instansiyaga kelgan agentga umuman yetib bormasdi, panel esa
 *    `queued: true` deb ko'rsatardi. Endi navbat DB da: vazifa tasdiqlanmaguncha
 *    (natija kelmaguncha yoki 3 daqiqa o'tmaguncha) saqlanadi va javob yo'qolsa
 *    60 soniyadan keyin agentga QAYTA beriladi.
 *
 * Barcha yangi ustunlar DEFAULT/NULLABLE: standart xatti-harakat o'zgarmaydi
 * (offDelay=0, preOn=0 — ya'ni mavjud klublar hech qanday farqni sezmaydi).
 * Mavjud 1784247400000-TableLightControl migratsiyasiga TEGILMAYDI.
 */
export class LightControlPro1784247700000 implements MigrationInterface {
  name = 'LightControlPro1784247700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- 1. light_driver enumini kengaytirish (almashtirish usuli) ----------
    await queryRunner.query(`ALTER TYPE "public"."light_driver" RENAME TO "light_driver_old"`);
    await queryRunner.query(`
      CREATE TYPE "public"."light_driver" AS ENUM(
        'none', 'shelly_gen1', 'shelly_gen2', 'tasmota', 'esphome',
        'home_assistant', 'mqtt', 'tcp', 'modbus_tcp', 'serial', 'http'
      )
    `);
    // DEFAULT eski turga bog'langani uchun avval olib tashlanadi, keyin qaytariladi
    await queryRunner.query(`ALTER TABLE "tables" ALTER COLUMN "lightDriver" DROP DEFAULT`);
    await queryRunner.query(`
      ALTER TABLE "tables" ALTER COLUMN "lightDriver"
      TYPE "public"."light_driver" USING "lightDriver"::text::"public"."light_driver"
    `);
    await queryRunner.query(
      `ALTER TABLE "tables" ALTER COLUMN "lightDriver" SET DEFAULT 'none'`,
    );
    await queryRunner.query(`DROP TYPE "public"."light_driver_old"`);

    // ---------- 2. tables: drayverga xos sozlamalar ----------
    await queryRunner.query(`ALTER TABLE "tables" ADD "lightConfig" jsonb`);

    // ---------- 3. settings: grace, bron oldidan yoqish, sinxronizatsiya, tekshirish ----------
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "lightOffDelaySec" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "lightPreOnMinutes" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "lightForceSyncSec" integer NOT NULL DEFAULT 60`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "lightVerify" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(`
      ALTER TABLE "settings" ADD CONSTRAINT "chk_settings_light_off_delay"
      CHECK ("lightOffDelaySec" >= 0 AND "lightOffDelaySec" <= 3600)
    `);
    await queryRunner.query(`
      ALTER TABLE "settings" ADD CONSTRAINT "chk_settings_light_pre_on"
      CHECK ("lightPreOnMinutes" >= 0 AND "lightPreOnMinutes" <= 120)
    `);
    await queryRunner.query(`
      ALTER TABLE "settings" ADD CONSTRAINT "chk_settings_light_force_sync"
      CHECK ("lightForceSyncSec" >= 10 AND "lightForceSyncSec" <= 3600)
    `);

    // ---------- 4. table_light_events (diagnostika jurnali) ----------
    await queryRunner.query(`
      CREATE TABLE "table_light_events" (
        "id" SERIAL NOT NULL,
        "clubId" integer NOT NULL,
        "tableId" integer NOT NULL,
        "at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "isOn" boolean,
        "source" character varying(16) NOT NULL,
        "ok" boolean NOT NULL DEFAULT true,
        "error" character varying(300),
        "userId" integer,
        CONSTRAINT "PK_table_light_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_table_light_events_club" FOREIGN KEY ("clubId")
          REFERENCES "clubs"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_table_light_events_table" FOREIGN KEY ("tableId")
          REFERENCES "tables"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_table_light_events_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    // Ikkala issiq so'rov ham "eng yangisi birinchi" — shuning uchun DESC
    await queryRunner.query(
      `CREATE INDEX "IDX_light_events_club_at" ON "table_light_events" ("clubId", "at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_light_events_table_at" ON "table_light_events" ("tableId", "at" DESC)`,
    );
    // Kunlik tozalash ("at" < now() - 30 kun) klub bo'yicha emas, FAQAT vaqt
    // bo'yicha filtrlaydi — unga alohida indeks kerak (aks holda seq scan)
    await queryRunner.query(`CREATE INDEX "IDX_light_events_at" ON "table_light_events" ("at")`);

    // ---------- 5. sessions: grace (oxirgi yakunlangan sessiya) uchun qisman indeks ----------
    await queryRunner.query(`
      CREATE INDEX "IDX_sessions_table_endTime_finished"
      ON "sessions" ("tableId", "endTime" DESC)
      WHERE status IN ('completed', 'cancelled')
    `);

    // ---------- 6. club_bridges: vazifa navbati va oxirgi qidiruv natijasi ----------
    // Hammasi NULLABLE — mavjud agentlar uchun hech narsa o'zgarmaydi
    await queryRunner.query(
      `ALTER TABLE "club_bridges" ADD "pendingTaskId" character varying(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_bridges" ADD "pendingTaskType" character varying(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_bridges" ADD "pendingTaskSubnet" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_bridges" ADD "pendingTaskAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_bridges" ADD "taskStartedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_bridges" ADD "lastDiscoverAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "club_bridges" ADD "lastDiscover" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ---------- 6. club_bridges ----------
    await queryRunner.query(`ALTER TABLE "club_bridges" DROP COLUMN "lastDiscover"`);
    await queryRunner.query(`ALTER TABLE "club_bridges" DROP COLUMN "lastDiscoverAt"`);
    await queryRunner.query(`ALTER TABLE "club_bridges" DROP COLUMN "taskStartedAt"`);
    await queryRunner.query(`ALTER TABLE "club_bridges" DROP COLUMN "pendingTaskAt"`);
    await queryRunner.query(`ALTER TABLE "club_bridges" DROP COLUMN "pendingTaskSubnet"`);
    await queryRunner.query(`ALTER TABLE "club_bridges" DROP COLUMN "pendingTaskType"`);
    await queryRunner.query(`ALTER TABLE "club_bridges" DROP COLUMN "pendingTaskId"`);

    // ---------- 5. sessions ----------
    await queryRunner.query(`DROP INDEX "public"."IDX_sessions_table_endTime_finished"`);

    // ---------- 4. jurnal (indekslar jadval bilan birga o'chadi) ----------
    await queryRunner.query(`DROP TABLE "table_light_events"`);

    // ---------- 3. settings ----------
    await queryRunner.query(
      `ALTER TABLE "settings" DROP CONSTRAINT "chk_settings_light_force_sync"`,
    );
    await queryRunner.query(`ALTER TABLE "settings" DROP CONSTRAINT "chk_settings_light_pre_on"`);
    await queryRunner.query(`ALTER TABLE "settings" DROP CONSTRAINT "chk_settings_light_off_delay"`);
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "lightVerify"`);
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "lightForceSyncSec"`);
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "lightPreOnMinutes"`);
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "lightOffDelaySec"`);

    // ---------- 2. tables ----------
    await queryRunner.query(`ALTER TABLE "tables" DROP COLUMN "lightConfig"`);

    // ---------- 1. enumni eski holatiga qaytarish ----------
    // Yangi drayverlar eski turda mavjud emas — ular avval 'none' ga tushiriladi
    // (chiroq o'chadi, lekin sessiya/pul oqimiga ta'sir qilmaydi).
    await queryRunner.query(`
      UPDATE "tables" SET "lightDriver" = 'none'
      WHERE "lightDriver" IN ('esphome', 'home_assistant', 'mqtt', 'tcp', 'modbus_tcp', 'serial')
    `);
    await queryRunner.query(`ALTER TYPE "public"."light_driver" RENAME TO "light_driver_new"`);
    await queryRunner.query(
      `CREATE TYPE "public"."light_driver" AS ENUM('none', 'shelly_gen1', 'shelly_gen2', 'tasmota', 'http')`,
    );
    await queryRunner.query(`ALTER TABLE "tables" ALTER COLUMN "lightDriver" DROP DEFAULT`);
    await queryRunner.query(`
      ALTER TABLE "tables" ALTER COLUMN "lightDriver"
      TYPE "public"."light_driver" USING "lightDriver"::text::"public"."light_driver"
    `);
    await queryRunner.query(
      `ALTER TABLE "tables" ALTER COLUMN "lightDriver" SET DEFAULT 'none'`,
    );
    await queryRunner.query(`DROP TYPE "public"."light_driver_new"`);
  }
}
