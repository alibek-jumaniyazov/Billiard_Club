import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { getRequestLang } from '../decorators/lang.decorator';
import { t } from '../i18n/messages';

/**
 * Yagona xato formati: { success: false, message, code?, errors? }.
 * - HttpException payload'ida { key, args } bo'lsa — i18n katalogidan tarjima qilinadi.
 * - class-validator xatolari 'errors' massivida qaytadi.
 * - Kutilmagan xatolar klientga ichki tafsilotlarsiz "Server xatosi" bo'lib chiqadi.
 * - Postgres unique/FK xatolari foydali 409/400 javoblarga aylanadi.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

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

    response.status(status).json({
      success: false,
      message,
      ...(code ? { code } : {}),
      ...(errors ? { errors } : {}),
    });
  }
}
