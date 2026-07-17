import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SaaS platforma kengaytmasi — asosiy ma'lumotlar modeli:
 *
 *  - refresh_sessions: token rotatsiyasi + reuse aniqlash + qurilma bo'yicha logout
 *  - audit_logs: audit jurnali (login, obuna, tuzatishlar va h.k.)
 *  - plans / invoices / coupons: obuna tariflari, hisob-fakturalar, chegirmalar
 *  - feedbacks: fikr-mulohaza markazi (taklif/shikoyat/xatolik/imkoniyat)
 *  - customers: mijozlar ro'yxati (erkin matn o'rniga)
 *  - expenses: xarajatlar
 *  - reservations: stol bronlari
 *  - session_segments: stol almashtirish (transfer) uchun narx segmentlari
 *  - session_payments: bo'lib to'lash (split payment)
 *  - club_notifications: superadmindan klublarga xabarnomalar (fan-out)
 *  - platform_settings: platforma kalit/qiymat sozlamalari (telegram_events)
 *  - ustun qo'shimchalari: sessions (sekundlik hisob, tuzatish, mijoz),
 *    users (login bloklash), settings (vaqt mintaqasi), debts (mijoz)
 */
export class PlatformExpansion1784247000000 implements MigrationInterface {
  name = 'PlatformExpansion1784247000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- Yangi enum turlari ----------
    await queryRunner.query(
      `CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'cancelled', 'expired')`,
    );
    await queryRunner.query(`CREATE TYPE "public"."coupon_type" AS ENUM('percent', 'fixed')`);
    await queryRunner.query(
      `CREATE TYPE "public"."feedback_type" AS ENUM('suggestion', 'complaint', 'bug', 'feature')`,
    );
    await queryRunner.query(`CREATE TYPE "public"."feedback_priority" AS ENUM('low', 'medium', 'high')`);
    await queryRunner.query(
      `CREATE TYPE "public"."feedback_status" AS ENUM('unread', 'read', 'resolved', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'confirmed', 'seated', 'cancelled', 'no_show')`,
    );

    // ---------- plans ----------
    await queryRunner.query(`
      CREATE TABLE "plans" (
        "id" SERIAL NOT NULL,
        "code" character varying(50) NOT NULL,
        "nameUz" character varying(100) NOT NULL,
        "nameRu" character varying(100) NOT NULL,
        "descriptionUz" text,
        "descriptionRu" text,
        "durationDays" integer NOT NULL,
        "price" numeric(14,2) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "features" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_plans" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_plans_code" UNIQUE ("code"),
        CONSTRAINT "chk_plans_valid" CHECK ("price" >= 0 AND "durationDays" > 0)
      )
    `);

    // ---------- coupons ----------
    await queryRunner.query(`
      CREATE TABLE "coupons" (
        "id" SERIAL NOT NULL,
        "code" character varying(50) NOT NULL,
        "type" "public"."coupon_type" NOT NULL,
        "value" numeric(14,2) NOT NULL,
        "maxUses" integer,
        "usedCount" integer NOT NULL DEFAULT 0,
        "validFrom" TIMESTAMP WITH TIME ZONE,
        "validTo" TIMESTAMP WITH TIME ZONE,
        "isActive" boolean NOT NULL DEFAULT true,
        "planId" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coupons" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_coupons_code" UNIQUE ("code"),
        CONSTRAINT "FK_coupons_plan" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_coupons_nonneg" CHECK ("value" >= 0 AND "usedCount" >= 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_coupons_planId" ON "coupons" ("planId")`);

    // ---------- refresh_sessions ----------
    await queryRunner.query(`
      CREATE TABLE "refresh_sessions" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "jti" uuid NOT NULL,
        "familyId" uuid NOT NULL,
        "tokenHash" character varying(64) NOT NULL,
        "userAgent" character varying(255),
        "ip" character varying(45),
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "rotatedToJti" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refresh_sessions_jti" UNIQUE ("jti"),
        CONSTRAINT "FK_refresh_sessions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_refresh_sessions_userId" ON "refresh_sessions" ("userId")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_sessions_familyId" ON "refresh_sessions" ("familyId")`,
    );

    // ---------- audit_logs ----------
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" SERIAL NOT NULL,
        "clubId" integer,
        "userId" integer,
        "actorRole" character varying(20),
        "action" character varying(100) NOT NULL,
        "entity" character varying(50),
        "entityId" integer,
        "method" character varying(10),
        "path" character varying(500),
        "ip" character varying(45),
        "userAgent" character varying(255),
        "meta" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_logs_club" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_club_createdAt" ON "audit_logs" ("clubId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_action_createdAt" ON "audit_logs" ("action", "createdAt")`,
    );

    // ---------- invoices ----------
    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" SERIAL NOT NULL,
        "clubId" integer NOT NULL,
        "planId" integer,
        "contractId" integer,
        "number" character varying(30) NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "discountAmount" numeric(14,2) NOT NULL DEFAULT '0',
        "couponId" integer,
        "status" "public"."invoice_status" NOT NULL DEFAULT 'pending',
        "paymentMethod" character varying(30),
        "paidAt" TIMESTAMP WITH TIME ZONE,
        "notes" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_invoices_number" UNIQUE ("number"),
        CONSTRAINT "FK_invoices_club" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invoices_plan" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_invoices_contract" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_invoices_coupon" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_invoices_amounts_nonneg" CHECK ("amount" >= 0 AND "discountAmount" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_invoices_club_createdAt" ON "invoices" ("clubId", "createdAt")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_invoices_planId" ON "invoices" ("planId")`);
    await queryRunner.query(`CREATE INDEX "IDX_invoices_contractId" ON "invoices" ("contractId")`);
    await queryRunner.query(`CREATE INDEX "IDX_invoices_couponId" ON "invoices" ("couponId")`);
    await queryRunner.query(`CREATE INDEX "IDX_invoices_status" ON "invoices" ("status")`);

    // ---------- feedbacks ----------
    await queryRunner.query(`
      CREATE TABLE "feedbacks" (
        "id" SERIAL NOT NULL,
        "clubId" integer NOT NULL,
        "userId" integer NOT NULL,
        "type" "public"."feedback_type" NOT NULL,
        "priority" "public"."feedback_priority" NOT NULL DEFAULT 'medium',
        "category" character varying(50),
        "subject" character varying(200) NOT NULL,
        "message" text NOT NULL,
        "attachments" jsonb,
        "status" "public"."feedback_status" NOT NULL DEFAULT 'unread',
        "reply" text,
        "repliedById" integer,
        "repliedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_feedbacks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_feedbacks_club" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_feedbacks_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_feedbacks_repliedBy" FOREIGN KEY ("repliedById") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_feedbacks_status_createdAt" ON "feedbacks" ("status", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_feedbacks_club_createdAt" ON "feedbacks" ("clubId", "createdAt")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_feedbacks_userId" ON "feedbacks" ("userId")`);

    // ---------- customers ----------
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" SERIAL NOT NULL,
        "clubId" integer NOT NULL,
        "name" character varying(100) NOT NULL,
        "phone" character varying(20),
        "notes" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customers_club" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT
      )
    `);
    // Klub ichida telefon unikal (faqat kiritilgan bo'lsa)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_customers_club_phone"
      ON "customers" ("clubId", "phone") WHERE "phone" IS NOT NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_customers_club_name" ON "customers" ("clubId", "name")`);

    // ---------- expenses ----------
    await queryRunner.query(`
      CREATE TABLE "expenses" (
        "id" SERIAL NOT NULL,
        "clubId" integer NOT NULL,
        "userId" integer,
        "category" character varying(50) NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "description" text,
        "spentAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_expenses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expenses_club" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_expenses_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_expenses_amount_nonneg" CHECK ("amount" >= 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_expenses_club_spentAt" ON "expenses" ("clubId", "spentAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_expenses_userId" ON "expenses" ("userId")`);

    // ---------- reservations ----------
    await queryRunner.query(`
      CREATE TABLE "reservations" (
        "id" SERIAL NOT NULL,
        "clubId" integer NOT NULL,
        "tableId" integer NOT NULL,
        "customerId" integer,
        "customerName" character varying(100),
        "customerPhone" character varying(20),
        "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "durationMinutes" integer,
        "status" "public"."reservation_status" NOT NULL DEFAULT 'pending',
        "notes" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reservations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reservations_club" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_reservations_table" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_reservations_customer" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_reservations_club_startsAt" ON "reservations" ("clubId", "startsAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reservations_table_startsAt" ON "reservations" ("tableId", "startsAt")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_reservations_customerId" ON "reservations" ("customerId")`);
    await queryRunner.query(`CREATE INDEX "IDX_reservations_status" ON "reservations" ("status")`);

    // ---------- session_segments ----------
    await queryRunner.query(`
      CREATE TABLE "session_segments" (
        "id" SERIAL NOT NULL,
        "sessionId" integer NOT NULL,
        "tableId" integer NOT NULL,
        "pricePerHour" numeric(14,2) NOT NULL,
        "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_session_segments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_session_segments_session" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_session_segments_table" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_session_segments_price_nonneg" CHECK ("pricePerHour" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_session_segments_sessionId" ON "session_segments" ("sessionId")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_session_segments_tableId" ON "session_segments" ("tableId")`);

    // ---------- session_payments ----------
    await queryRunner.query(`
      CREATE TABLE "session_payments" (
        "id" SERIAL NOT NULL,
        "clubId" integer NOT NULL,
        "sessionId" integer NOT NULL,
        "saleId" integer,
        "method" "public"."payment_method" NOT NULL DEFAULT 'cash',
        "amount" numeric(14,2) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_session_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_session_payments_club" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_session_payments_session" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_session_payments_sale" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_session_payments_amount_nonneg" CHECK ("amount" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_session_payments_club_createdAt" ON "session_payments" ("clubId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_session_payments_sessionId" ON "session_payments" ("sessionId")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_session_payments_saleId" ON "session_payments" ("saleId")`);

    // ---------- club_notifications ----------
    await queryRunner.query(`
      CREATE TABLE "club_notifications" (
        "id" SERIAL NOT NULL,
        "clubId" integer NOT NULL,
        "title" character varying(200) NOT NULL,
        "body" text NOT NULL,
        "type" character varying(30) NOT NULL DEFAULT 'info',
        "createdById" integer,
        "readAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_club_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_club_notifications_club" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_club_notifications_createdBy" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_club_notifications_club_readAt" ON "club_notifications" ("clubId", "readAt")`,
    );

    // ---------- platform_settings ----------
    await queryRunner.query(`
      CREATE TABLE "platform_settings" (
        "key" character varying(100) NOT NULL,
        "value" jsonb NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_platform_settings" PRIMARY KEY ("key")
      )
    `);

    // ---------- Mavjud jadvallarga ustun qo'shimchalari ----------
    // sessions: sekundlik hisob, qo'lda tuzatish, ro'yxatdagi mijoz
    await queryRunner.query(`ALTER TABLE "sessions" ADD "durationSeconds" integer`);
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD "adjustmentAmount" numeric(14,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(`ALTER TABLE "sessions" ADD "adjustmentReason" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "sessions" ADD "customerId" integer`);
    await queryRunner.query(`
      ALTER TABLE "sessions" ADD CONSTRAINT "FK_sessions_customer"
      FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sessions_customerId" ON "sessions" ("customerId")`);

    // users: brute-force himoyasi (urinishlar hisobi + vaqtinchalik blok)
    await queryRunner.query(`ALTER TABLE "users" ADD "failedLoginAttempts" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "users" ADD "lockedUntil" TIMESTAMP WITH TIME ZONE`);

    // settings: klub vaqt mintaqasi
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "timezone" character varying(50) NOT NULL DEFAULT 'Asia/Tashkent'`,
    );

    // debts: ro'yxatdagi mijoz
    await queryRunner.query(`ALTER TABLE "debts" ADD "customerId" integer`);
    await queryRunner.query(`
      ALTER TABLE "debts" ADD CONSTRAINT "FK_debts_customer"
      FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_debts_customerId" ON "debts" ("customerId")`);

    // Backfill: mavjud sessiyalar uchun sekundlik davomiylik daqiqadan hisoblanadi
    await queryRunner.query(
      `UPDATE "sessions" SET "durationSeconds" = "durationMinutes" * 60 WHERE "durationMinutes" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Ustun qo'shimchalarini qaytarish
    await queryRunner.query(`DROP INDEX "IDX_debts_customerId"`);
    await queryRunner.query(`ALTER TABLE "debts" DROP CONSTRAINT "FK_debts_customer"`);
    await queryRunner.query(`ALTER TABLE "debts" DROP COLUMN "customerId"`);
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "timezone"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lockedUntil"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "failedLoginAttempts"`);
    await queryRunner.query(`DROP INDEX "IDX_sessions_customerId"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP CONSTRAINT "FK_sessions_customer"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "customerId"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "adjustmentReason"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "adjustmentAmount"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "durationSeconds"`);

    // Jadvallar (bog'liqlik tartibining teskarisi)
    await queryRunner.query(`DROP TABLE "platform_settings"`);
    await queryRunner.query(`DROP TABLE "club_notifications"`);
    await queryRunner.query(`DROP TABLE "session_payments"`);
    await queryRunner.query(`DROP TABLE "session_segments"`);
    await queryRunner.query(`DROP TABLE "reservations"`);
    await queryRunner.query(`DROP TABLE "expenses"`);
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(`DROP TABLE "feedbacks"`);
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "refresh_sessions"`);
    await queryRunner.query(`DROP TABLE "coupons"`);
    await queryRunner.query(`DROP TABLE "plans"`);

    // Enum turlari
    await queryRunner.query(`DROP TYPE "public"."reservation_status"`);
    await queryRunner.query(`DROP TYPE "public"."feedback_status"`);
    await queryRunner.query(`DROP TYPE "public"."feedback_priority"`);
    await queryRunner.query(`DROP TYPE "public"."feedback_type"`);
    await queryRunner.query(`DROP TYPE "public"."coupon_type"`);
    await queryRunner.query(`DROP TYPE "public"."invoice_status"`);
  }
}
