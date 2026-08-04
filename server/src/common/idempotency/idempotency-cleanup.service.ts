import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Kalitlarning saqlash muddati (soat). Oflayn navbat bundan uzoq kutmaydi:
 * navbat ketma-ket yuboriladi va tarmoq tiklanishi bilan bo'shatiladi.
 */
const KEYS_RETENTION_HOURS = 48;

/** Tozalash bo'lagi: bitta ulkan DELETE o'rniga kichik qadamlar */
const KEYS_CLEANUP_BATCH = 5000;

/** Tozalash sikli hech qachon cheksiz aylanmasin (5000 * 200 = 1 mln qator) */
const KEYS_CLEANUP_MAX_STEPS = 200;

/**
 * idempotency_keys jadvalini tozalab turadigan kunlik cron.
 *
 * Jadval har bir oflayn mutatsiyada o'sadi va u faqat TEXNIK ma'noga ega —
 * 48 soatdan keyin qatorning hech qanday qiymati qolmaydi. Tozalanmasa
 * jadval cheksiz o'sib, unique indeks bilan birga diskni yeb qo'yardi.
 *
 * O'chirish 5000 talik bo'laklarda (chiroq jurnali tozalashi bilan bir xil
 * naqsh): bitta ulkan DELETE uzoq tranzaksiya ochib, jadvalga yozayotgan
 * so'rovlarni bloklab turardi.
 */
@Injectable()
export class IdempotencyCleanupService {
  private readonly logger = new Logger(IdempotencyCleanupService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Cron('0 50 3 * * *')
  async cleanupKeys(): Promise<void> {
    try {
      let total = 0;
      for (let step = 0; step < KEYS_CLEANUP_MAX_STEPS; step += 1) {
        const result: unknown = await this.dataSource.query(
          `DELETE FROM idempotency_keys
           WHERE id IN (
             SELECT id FROM idempotency_keys
             WHERE "createdAt" < now() - make_interval(hours => $1)
             LIMIT $2
           )`,
          [KEYS_RETENTION_HOURS, KEYS_CLEANUP_BATCH],
        );
        // node-postgres DELETE uchun [rows, affected] qaytaradi
        const affected = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
        total += affected;
        // Bo'lak to'lmadi — eski yozuv qolmadi
        if (affected < KEYS_CLEANUP_BATCH) break;
      }
      if (total > 0) {
        this.logger.log(`Idempotentlik kalitlari tozalandi: ${total} ta yozuv o'chirildi`);
      }
    } catch (err) {
      this.logger.error(`Idempotentlik kalitlarini tozalash xatosi: ${(err as Error).message}`);
    }
  }
}
