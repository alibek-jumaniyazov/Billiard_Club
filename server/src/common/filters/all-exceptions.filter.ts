import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { TelegramService } from '../../telegram/telegram.service';
import { getRequestLang } from '../decorators/lang.decorator';
import { t } from '../i18n/messages';

/** Bir xil xato uchun Telegram ogohlantirishi shu oraliqda faqat bir marta */
const ALERT_COOLDOWN_MS = 10 * 60 * 1000;

/** Ogohlantirish xotirasi cheksiz o'smasin (crash-loop turli imzolar chiqarishi mumkin) */
const ALERT_CACHE_MAX = 200;

/**
 * Umumiy "pol": imzosidan qat'i nazar shu oraliqda bittadan ko'p ogohlantirish
 * yuborilmaydi. DB yiqilganda o'nlab turli imzo bir vaqtda chiqadi — chat
 * bosilib ketmasin.
 */
const ALERT_MIN_INTERVAL_MS = 30 * 1000;

/**
 * Yagona xato formati: { success: false, message, code?, errors? }.
 * - HttpException payload'ida { key, args } bo'lsa — i18n katalogidan tarjima qilinadi.
 * - class-validator xatolari 'errors' massivida qaytadi.
 * - Kutilmagan xatolar klientga ichki tafsilotlarsiz "Server xatosi" bo'lib chiqadi.
 * - Postgres unique/FK/NOT NULL xatolari foydali 409/400 javoblarga aylanadi.
 * - KUTILMAGAN 5xx lar platforma egasiga Telegram orqali xabar qilinadi
 *   (fire-and-forget, imzo bo'yicha 10 daqiqalik cheklov bilan).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  /**
   * xato imzosi -> oxirgi yuborilgan ogohlantirish vaqti (ms).
   * Joylashuv tartibi = oxirgi ogohlantirish tartibi (eng eskisi boshida),
   * shu sababli qayta yozishdan oldin kalit o'chiriladi.
   */
  private readonly alertedAt = new Map<string, number>();

  /** Oxirgi yuborilgan ogohlantirish vaqti (umumiy pol uchun) */
  private lastAlertAt = 0;

  constructor(
    // Telegram moduli global, lekin filtr undan MUSTAQIL ishlashi kerak:
    // xabarnoma yo'qligi xato javobini buzmasin
    @Optional() private readonly telegram?: TelegramService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const lang = getRequestLang(request);

    // Javob allaqachon yuborilgan bo'lsa (masalan Excel oqimi o'rtasida) — qayta yubormaymiz
    if (response.headersSent) {
      this.logger.error(`Headers already sent: ${String(exception)}`);
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = t(lang, 'common.serverError');
    let code: string | undefined;
    let errors: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const p = payload as Record<string, any>;
        if (p.key) {
          // Bizning i18n kalitli xatolarimiz
          message = t(lang, p.key, p.args);
          code = p.code;
        } else if (Array.isArray(p.message)) {
          // class-validator xatolari
          message = t(lang, 'common.validationError');
          errors = p.message;
        } else if (p.message) {
          message = p.message;
          code = p.code;
        }
      }
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        message = t(lang, 'common.tooManyRequests');
      }
    } else if (exception instanceof QueryFailedError) {
      const driverError = (exception as QueryFailedError & { driverError?: { code?: string } })
        .driverError;
      if (driverError?.code === '23505') {
        // unique_violation
        status = HttpStatus.CONFLICT;
        message = t(lang, 'common.conflict');
      } else if (driverError?.code === '23502') {
        // not_null_violation — DTO dan literal `null` o'tib ketgan bo'lsa 500
        // emas, validatsiya xatosi qaytsin. Logga chiqadi: bu servisdagi kamchilik
        this.logger.warn(`NOT NULL buzilishi (23502): ${exception.message}`);
        status = HttpStatus.BAD_REQUEST;
        message = t(lang, 'common.validationError');
      } else if (driverError?.code === '23503' || driverError?.code === '23514') {
        // foreign_key_violation / check_violation
        status = HttpStatus.BAD_REQUEST;
        message = t(lang, 'common.validationError');
      } else {
        this.logger.error(exception.message, (exception as Error).stack);
      }
    } else {
      const err = exception as Error;
      this.logger.error(err?.message ?? String(exception), err?.stack);
    }

    // FAQAT kutilmagan 5xx — 4xx (validatsiya, ruxsat, topilmadi) xabar qilinmaydi
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.alertCriticalError(exception, request);
    }

    response.status(status).json({
      success: false,
      message,
      ...(code ? { code } : {}),
      ...(errors ? { errors } : {}),
    });
  }

  /**
   * Platforma egasiga kritik xato haqida Telegram xabari.
   * QAT'IY fire-and-forget: kutilmaydi va o'z .catch() i bor — xabarnoma
   * xatosi asl xatoni yashirmasligi yoki jarayonni yiqitmasligi kerak.
   * Bir xil imzo (metod + yo'l + xato matni) uchun 10 daqiqada bir marta —
   * "crash loop" chatni bosib ketmasin. Bundan tashqari imzodan qat'i nazar
   * umumiy pol bor (ALERT_MIN_INTERVAL_MS).
   */
  private alertCriticalError(exception: unknown, request: { method?: string; url?: string }): void {
    if (!this.telegram) return;

    try {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      const method = request?.method ?? '-';
      const path = String(request?.url ?? '-').split('?')[0];
      const signature = `${method} ${path} ${err.message}`;

      const now = Date.now();
      const last = this.alertedAt.get(signature);
      if (last !== undefined && now - last < ALERT_COOLDOWN_MS) return;

      // Umumiy pol: turli imzolar bir vaqtda yog'ilsa ham oqim tiyiladi.
      // DIQQAT: bu yerda imzo vaqti YOZILMAYDI — aks holda ogohlantirilmagan
      // xato 10 daqiqaga "sovutilgan" bo'lib qolardi.
      if (now - this.lastAlertAt < ALERT_MIN_INTERVAL_MS) return;

      // Xarita cheksiz o'smasin: avval eskirgan yozuvlar, keyin ham joy
      // yetmasa — eng eski yozuvlardan (Map joylashuv tartibini saqlaydi)
      // yarim hajmgacha chiqarib tashlanadi. clear() QILINMAYDI: aks holda
      // aynan bo'ron paytida barcha TIRIK sovutishlar yo'qolib, keyingi
      // xato hammasini qaytadan yuborardi.
      if (this.alertedAt.size >= ALERT_CACHE_MAX) {
        for (const [key, at] of this.alertedAt) {
          if (now - at >= ALERT_COOLDOWN_MS) this.alertedAt.delete(key);
        }
        const target = Math.floor(ALERT_CACHE_MAX / 2);
        for (const key of this.alertedAt.keys()) {
          if (this.alertedAt.size <= target) break;
          this.alertedAt.delete(key);
        }
      }
      // Tartib yangilansin (eng eski boshida qolsin) — avval o'chirib, keyin yozamiz
      this.alertedAt.delete(signature);
      this.alertedAt.set(signature, now);
      this.lastAlertAt = now;

      void this.telegram
        .notifyCriticalError(`${method} ${path}`, err)
        .catch((alertErr: Error) =>
          this.logger.error(`Kritik xato ogohlantirishi yuborilmadi: ${alertErr.message}`),
        );
    } catch {
      // Ogohlantirish yo'li HECH QACHON asl xato javobini buzmasligi kerak
    }
  }
}
