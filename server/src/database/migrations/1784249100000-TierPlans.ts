import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TARIF DARAJALARI: Standart → Pro → VIP, har biri 1 / 3 / 6 / 12 oylik.
 *
 *  - clubs.tier — klubning darajasi. MAVJUD klublar 'vip': ular avval "hamma
 *    imkoniyat" tarifini sotib olgan, hech narsasi yopilib qolmasin. Keyingi
 *    to'lovda o'zlari daraja tanlaydi.
 *  - plans.tier — tarif qaysi darajani sotadi. Eski oylik/6 oylik/yillik
 *    tariflar ham 'vip' (ular barcha imkoniyatli edi) va sotuvdan olinadi —
 *    eski hisob-fakturalar ularga bog'liqligicha qoladi.
 *  - 12 ta yangi tarif, buyurtmachi tasdiqlagan narxlar bilan; keyin
 *    superadmin panelida o'zgartiriladi.
 *
 * Imkoniyat/cheklovlar (bar, bron, stollar soni…) jadvalda emas —
 * platform_settings → `plan_tiers` (common/plan-tiers), standarti kodda.
 * Qiymatlar shu yerda ATAYLAB nusxalangan: migratsiya keyin kod o'zgarsa ham
 * o'sha natijani berishi kerak.
 */
const DURATIONS = [
  { months: 1, days: 30, uz: '1 oy', ru: '1 месяц' },
  { months: 3, days: 90, uz: '3 oy', ru: '3 месяца' },
  { months: 6, days: 180, uz: '6 oy', ru: '6 месяцев' },
  { months: 12, days: 365, uz: '1 yil', ru: '1 год' },
];

const TIERS = [
  { code: 'standard', uz: 'Standart', ru: 'Стандарт', level: 1, prices: [179000, 499000, 949000, 1790000] },
  { code: 'pro', uz: 'Pro', ru: 'Pro', level: 2, prices: [249000, 699000, 1319000, 2490000] },
  { code: 'vip', uz: 'VIP', ru: 'VIP', level: 3, prices: [349000, 979000, 1849000, 3490000] },
];

const LEGACY_CODES = ['monthly', 'semiannual', 'yearly'];

export class TierPlans1784249100000 implements MigrationInterface {
  name = 'TierPlans1784249100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "tier" varchar(20) NOT NULL DEFAULT 'vip'`);
    await queryRunner.query(`ALTER TABLE "clubs" DROP CONSTRAINT IF EXISTS "chk_clubs_tier"`);
    await queryRunner.query(
      `ALTER TABLE "clubs" ADD CONSTRAINT "chk_clubs_tier" CHECK ("tier" IN ('standard', 'pro', 'vip'))`,
    );

    // Avval 'vip' bilan qo'shiladi (eski qatorlar), keyin yangi qatorlar uchun standart 'standard'
    await queryRunner.query(`ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "tier" varchar(20) NOT NULL DEFAULT 'vip'`);
    await queryRunner.query(`ALTER TABLE "plans" ALTER COLUMN "tier" SET DEFAULT 'standard'`);
    await queryRunner.query(`ALTER TABLE "plans" DROP CONSTRAINT IF EXISTS "chk_plans_tier"`);
    await queryRunner.query(
      `ALTER TABLE "plans" ADD CONSTRAINT "chk_plans_tier" CHECK ("tier" IN ('standard', 'pro', 'vip'))`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_plans_tier" ON "plans" ("tier")`);

    await queryRunner.query(`UPDATE "plans" SET "isActive" = false WHERE "code" = ANY($1)`, [LEGACY_CODES]);

    for (const tier of TIERS) {
      for (let i = 0; i < DURATIONS.length; i += 1) {
        const d = DURATIONS[i];
        await queryRunner.query(
          `INSERT INTO "plans" ("code", "tier", "nameUz", "nameRu", "durationDays", "price", "isActive", "sortOrder")
           VALUES ($1, $2, $3, $4, $5, $6, true, $7)
           ON CONFLICT ("code") DO NOTHING`,
          [
            `${tier.code}_${d.months}m`,
            tier.code,
            `${tier.uz} · ${d.uz}`,
            `${tier.ru} · ${d.ru}`,
            d.days,
            tier.prices[i],
            tier.level * 10 + i + 1,
          ],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const codes = TIERS.flatMap((tier) => DURATIONS.map((d) => `${tier.code}_${d.months}m`));
    // Fakturalar planId ON DELETE SET NULL — tarix yo'qolmaydi, faqat bog'lanish uziladi
    await queryRunner.query(`DELETE FROM "plans" WHERE "code" = ANY($1)`, [codes]);
    await queryRunner.query(`UPDATE "plans" SET "isActive" = true WHERE "code" = ANY($1)`, [LEGACY_CODES]);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plans_tier"`);
    await queryRunner.query(`ALTER TABLE "plans" DROP CONSTRAINT IF EXISTS "chk_plans_tier"`);
    await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN IF EXISTS "tier"`);
    await queryRunner.query(`ALTER TABLE "clubs" DROP CONSTRAINT IF EXISTS "chk_clubs_tier"`);
    await queryRunner.query(`ALTER TABLE "clubs" DROP COLUMN IF EXISTS "tier"`);
  }
}
