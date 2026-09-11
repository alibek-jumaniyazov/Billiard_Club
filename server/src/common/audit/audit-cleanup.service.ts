import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** Tozalash bo'lagi: bitta ulkan DELETE o'rniga kichik qadamlar */
const AUDIT_CLEANUP_BATCH = 5000;

/** Tozalash sikli hech qachon cheksiz aylanmasin (5000 * 400 = 2 mln qator) */
const AUDIT_CLEANUP_MAX_STEPS = 400;

/**
 * audit_logs jadvalining ixtiyoriy (OPT-IN) saqlash-muddati tozalagichi.
 *
 * MUHIM — STANDART HOLATDA O'CHIQ. Audit yozuvlari (kim/qachon/qancha pul
 * o'chirdi, impersonatsiya, login) compliance/forensik qiymatga ega, shuning
 * uchun ularni JIMGINA o'chirib yubormaymiz: faqat operator `AUDIT_RETENTION_DAYS`
 * ni musbat songa qo'ysagina (masalan 365) o'sha kundan eski yozuvlar tozalanadi.
 * Qo'yilmasa (yoki <= 0) — hech nima o'chirilmaydi, jadval avvalgidek to'liq qoladi.
 *
 * Filtr `createdAt` bo'yicha — unga migratsiyada alohida indeks qo'shilgan
 * (IDX_audit_logs_createdAt), aks holda nochor to'liq skan bo'lardi (mavjud
 * kompozitlarda createdAt ikkinchi ustun). O'chirish 5000 talik bo'laklarda
 * (boshqa tozalash cron'lari bilan bir xil naqsh), butun tanasi try/catch da.
 */
@Injectable()
export class AuditCleanupService {
  private readonly logger = new Logger(AuditCleanupService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private retentionDays(): number {
    const raw = parseInt(process.env.AUDIT_RETENTION_DAYS ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }

  @Cron('0 30 3 * * *')
  async cleanupOldLogs(): Promise<void> {
    const days = this.retentionDays();
    if (days <= 0) return; // opt-in: sozlanmagan bo'lsa hech nima o'chirilmaydi

    try {
      let total = 0;
      for (let step = 0; step < AUDIT_CLEANUP_MAX_STEPS; step += 1) {
        const result: unknown = await this.dataSource.query(
          `DELETE FROM audit_logs
           WHERE id IN (
             SELECT id FROM audit_logs
             WHERE "createdAt" < now() - make_interval(days => $1)
             LIMIT $2
           )`,
          [days, AUDIT_CLEANUP_BATCH],
        );
        // node-postgres DELETE uchun [rows, affected] qaytaradi
        const affected = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
        total += affected;
        if (affected < AUDIT_CLEANUP_BATCH) break;
      }
      if (total > 0) {
        this.logger.log(
          `Audit jurnali tozalandi: ${total} ta yozuv o'chirildi (retention=${days} kun)`,
        );
      }
    } catch (err) {
      this.logger.error(`Audit jurnalini tozalash xatosi: ${(err as Error).message}`);
    }
  }
}
