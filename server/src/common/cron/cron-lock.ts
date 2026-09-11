import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

const logger = new Logger('CronLock');

/**
 * Cron ishini FAQAT bitta instansiyada bajarish (leader election) — Postgres
 * advisory lock orqali. Ko'p instansiyali (replica) deploy'da har `@Cron` har
 * instansiyada mustaqil ishga tushadi; bu nojoiz takrorni (masalan bir klubga
 * IKKI marta eslatma) yoki ortiqcha ishni keltirib chiqaradi. Bitta instansiyada
 * lock DOIM olinadi — xatti-harakat aynan avvalgidek qoladi, shuning uchun
 * standart (yakka) deploy'ga hech qanday ta'sir yo'q.
 *
 * NEGA alohida queryRunner: advisory lock SESSIYA (ulanish) darajasida — lock
 * va unlock BIR XIL ulanishda bajarilishi SHART (pool'dan boshqa ulanishda
 * unlock ishlamaydi). Shu bois bitta ajratilgan ulanish olinadi, ish tugagach
 * qaytariladi. fn() tranzaksiya ICHIDA emas: uzun/IO-li cron tanasi (Telegram
 * so'rovlari va h.k.) tranzaksiyani ochiq ushlab qulflarni bloklamasin —
 * faqat advisory lock ushlab turiladi.
 *
 * @returns fn bajarildimi (bu instansiya lider bo'ldimi)
 */
export async function withCronLock(
  dataSource: DataSource,
  lockKey: number,
  fn: () => Promise<void>,
): Promise<boolean> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    const rows = (await runner.query('SELECT pg_try_advisory_lock($1) AS locked', [
      lockKey,
    ])) as Array<{ locked: boolean }>;
    if (!rows[0]?.locked) {
      // Boshqa instansiya bu ishni allaqachon bajarmoqda — jimgina o'tkazamiz
      return false;
    }
    try {
      await fn();
      return true;
    } finally {
      await runner.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    }
  } catch (err) {
    logger.error(`Cron lock (${lockKey}) xatosi: ${(err as Error).message}`);
    return false;
  } finally {
    await runner.release();
  }
}

/**
 * Cron lock kalitlari — har bir cron uchun YAGONA bo'lishi shart (aks holda
 * ikki xil cron bir-birini bloklab qo'yadi). Yangi cron qo'shsangiz shu yerga
 * yangi noyob raqam qo'shing.
 */
export const CRON_LOCK = {
  subscriptionDaily: 785_001,
} as const;
