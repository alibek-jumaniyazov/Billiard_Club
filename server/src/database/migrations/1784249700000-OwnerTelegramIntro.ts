import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Klub egasi boti — avtomatik ulash.
 *
 * `introPending`: avval ro'yxatdan o'tgan egalar ham (ro'yxatdan o'tishda botga Start
 * bosgan) bir martalik tarzda avtomatik ulanadi. Ularga birinchi kunlik hisobotdan OLDIN
 * qisqa tanishtiruv xabari ketadi (qaerdan va nima uchun keldi, qanday to'xtatiladi).
 * Ulashning o'zi ishlash vaqtida bajariladi (bot sozlamasi ma'lum bo'lgandagina).
 */
export class OwnerTelegramIntro1784249700000 implements MigrationInterface {
  name = 'OwnerTelegramIntro1784249700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "owner_telegram_chats" ADD COLUMN IF NOT EXISTS "introPending" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "owner_telegram_chats" DROP COLUMN IF EXISTS "introPending"`);
  }
}
