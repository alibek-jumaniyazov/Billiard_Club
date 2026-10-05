import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrialTelegramVerification1784248500000 implements MigrationInterface {
  name = 'TrialTelegramVerification1784248500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE trial_telegram_challenges (
      id uuid PRIMARY KEY,
      "browserTokenHash" varchar(64) NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "expiresAt" timestamptz NOT NULL,
      "telegramUserId" varchar(30),
      phone varchar(20),
      "verifiedAt" timestamptz,
      "consumedAt" timestamptz
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_trial_challenge_expiry" ON trial_telegram_challenges ("expiresAt")`);
    // One active conversation per Telegram user; message IDs stop old contacts
    // and webhook retries from confirming a later browser challenge.
    await queryRunner.query(`CREATE TABLE trial_telegram_sessions (
      "telegramUserId" varchar(30) PRIMARY KEY,
      "challengeId" uuid REFERENCES trial_telegram_challenges(id) ON DELETE SET NULL,
      "lastMessageId" bigint NOT NULL,
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE trial_telegram_sessions');
    await queryRunner.query('DROP TABLE trial_telegram_challenges');
  }
}
