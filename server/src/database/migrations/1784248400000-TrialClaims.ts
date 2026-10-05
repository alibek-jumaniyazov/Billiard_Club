import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrialClaims1784248400000 implements MigrationInterface {
  name = 'TrialClaims1784248400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Independent of clubs: deleting a club must never release its trial claim.
    await queryRunner.query(`
      CREATE TABLE "trial_claims" (
        "phone" varchar(20) PRIMARY KEY,
        "claimedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "telegram_trial_claims" (
        "telegramUserId" varchar(30) PRIMARY KEY,
        "claimedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Equivalent to canonicalTrialPhone in modules/public/trial-phone.ts.
    await queryRunner.query(`
      CREATE FUNCTION canonical_trial_phone(value text) RETURNS text
      LANGUAGE plpgsql IMMUTABLE STRICT AS $$
      DECLARE
        input text;
        phone text;
        explicitly_international boolean;
      BEGIN
        input := regexp_replace(value, '^[[:space:]]+|[[:space:]]+$', '', 'g');
        IF input = '' OR input !~ '^[+]?[0-9[:space:]().-]+$' THEN
          RETURN NULL;
        END IF;

        phone := regexp_replace(input, '[^0-9]', '', 'g');
        explicitly_international := left(input, 1) = '+' OR left(phone, 2) = '00';
        IF left(phone, 2) = '00' THEN
          phone := substring(phone FROM 3);
        END IF;
        IF NOT explicitly_international AND length(phone) = 9 THEN
          phone := '998' || phone;
        END IF;

        IF phone !~ '^[1-9][0-9]{6,14}$' THEN
          RETURN NULL;
        END IF;
        RETURN phone;
      END;
      $$
    `);

    await queryRunner.query(`
      CREATE FUNCTION record_club_trial_phone() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        claim_phone text;
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          claim_phone := canonical_trial_phone(OLD."phone");
          IF claim_phone IS NOT NULL THEN
            INSERT INTO "trial_claims" ("phone") VALUES (claim_phone)
            ON CONFLICT ("phone") DO NOTHING;
          END IF;
        END IF;

        claim_phone := canonical_trial_phone(NEW."phone");
        IF claim_phone IS NOT NULL THEN
          INSERT INTO "trial_claims" ("phone") VALUES (claim_phone)
          ON CONFLICT ("phone") DO NOTHING;
        END IF;
        RETURN NEW;
      END;
      $$
    `);

    // Also covers club creation/phone changes through the administrator API.
    // This records claims without restricting intentional administrator actions.
    await queryRunner.query(`
      CREATE TRIGGER "TRG_clubs_trial_phone"
      AFTER INSERT OR UPDATE OF "phone" ON "clubs"
      FOR EACH ROW EXECUTE FUNCTION record_club_trial_phone()
    `);

    // All historic clubs count, regardless of current status or expired trial.
    await queryRunner.query(`
      INSERT INTO "trial_claims" ("phone", "claimedAt")
      SELECT canonical_trial_phone("phone"), MIN("createdAt")
      FROM "clubs"
      WHERE canonical_trial_phone("phone") IS NOT NULL
      GROUP BY canonical_trial_phone("phone")
      ON CONFLICT ("phone") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER "TRG_clubs_trial_phone" ON "clubs"`);
    await queryRunner.query(`DROP FUNCTION record_club_trial_phone()`);
    await queryRunner.query(`DROP FUNCTION canonical_trial_phone(text)`);
    await queryRunner.query(`DROP TABLE "telegram_trial_claims"`);
    await queryRunner.query(`DROP TABLE "trial_claims"`);
  }
}
