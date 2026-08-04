import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Observable, firstValueFrom, from } from 'rxjs';
import { QueryFailedError, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { IdempotencyKey } from '../../entities/idempotency-key.entity';
import { User } from '../../entities/user.entity';

/** Faqat holatni o'zgartiruvchi metodlar tekshiriladi (GET zararsiz) */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE']);

/** Kalit uzunligi chegarasi — ustun varchar(100) */
const MAX_KEY_LENGTH = 100;

/** Postgres: unique cheklov buzilishi */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Autentifikatsiya yo'llari ATAYLAB chetlab o'tiladi.
 *
 * Sabab: `/auth/*` javoblari HTTP sarlavhalari (httpOnly refresh cookie)
 * orqali ham ish qiladi. Saqlangan javob QAYTA o'ynatilganda tana aynan
 * qaytariladi, lekin `Set-Cookie` YO'Q — foydalanuvchi "kirdim" degan javobni
 * olib, aslida cookie'siz qolardi. Bu yo'llarda idempotentlik baribir kerak
 * emas: oflayn navbat ularni hech qachon navbatga qo'ymaydi.
 */
const SKIPPED_PATH_PREFIXES = ['/api/auth/'];

/**
 * IDEMPOTENTLIK INTERCEPTORI — takroriy mutatsiyalardan himoya.
 *
 * NEGA KERAK. Kassa amallari (sessiya boshlash/pauza/davom, bar buyurtmasi)
 * `Idempotency-Key` sarlavhasi bilan yuboriladi va JAVOB KELMASA qayta
 * yuboriladi. Lekin "javob kelmadi" ikki xil bo'ladi: (a) so'rov serverga
 * yetib bormadi, (b) so'rov BAJARILDI, faqat javob yo'lda yo'qoldi (yoki
 * klientda 20 soniyalik muddat tugadi). Ikkinchi holatda qayta yuborish
 * pulni ikki marta yozardi.
 *
 * OQIM (tartib MUHIM):
 *  1. Faqat POST/PUT/DELETE, faqat sarlavha BOR va autentifikatsiya qilingan
 *     so'rovlarda ishlaydi — qolgan trafik umuman tegilmaydi.
 *  2. Kalit HANDLER'DAN OLDIN band qilinadi: jadvalga `responseStatus = NULL`
 *     bilan qator qo'yiladi. Unique indeks buni ATOMIK qiladi.
 *       - Qator qo'yildi  -> amalni biz bajaramiz.
 *       - Unique xatosi   -> kalit allaqachon band:
 *           * javobi bor  -> o'sha javob aynan qaytariladi (handler ISHLAMAYDI);
 *           * javobi yo'q  -> AYNI DAMDA boshqa so'rov bajarayapti -> 409.
 *             Klient keyinroq qayta uradi va tayyor javobni oladi.
 *     Agar kalit avval band qilinmaganida, bir vaqtda kelgan ikkita bir xil
 *     so'rovning IKKALASI ham handler'ni bajarardi — aynan oldini olmoqchi
 *     bo'lgan holat.
 *  3. Amal muvaffaqiyatli tugasa javob shu qatorga yoziladi.
 *  4. Amal XATO bilan tugasa band qilingan qator O'CHIRILADI: foydalanuvchi
 *     sababni tuzatib (masalan yetarli qoldiq qo'yib) o'sha kalit bilan qayta
 *     yuborishi mumkin bo'lsin.
 *
 * MUHIM CHEGARA: javob mutatsiya tranzaksiyasidan TASHQARIDA saqlanadi
 * (Nest interceptori TypeORM tranzaksiyasini ko'rmaydi). Ya'ni "amal bajarildi,
 * javobni yozib bo'lmadi" holati nazariy jihatdan mumkin. Bunda ham himoya
 * SAQLANADI: band qilingan qator o'z joyida qoladi va qayta yuborish 409 oladi
 * (ikki marta bajarilmaydi) — faqat klient javobni qayta ololmaydi.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(IdempotencyKey)
    private readonly repo: Repository<IdempotencyKey>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // WebSocket/RPC konteksti bu yerga tushmaydi, lekin himoya arzon
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: User }>();
    const method = (req.method ?? '').toUpperCase();
    if (!MUTATING_METHODS.has(method)) return next.handle();

    const rawHeader = req.headers['idempotency-key'];
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    // Sarlavha yo'q — oddiy so'rov, hech narsa o'zgarmaydi
    if (header === undefined) return next.handle();

    const path = this.trunc(req.originalUrl ?? req.url, 500);
    if (SKIPPED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) return next.handle();

    const key = header.trim();
    if (key.length < 1 || key.length > MAX_KEY_LENGTH) {
      throw new BadRequestException({ key: 'common.validationError' });
    }

    // Kalitlar foydalanuvchi doirasida ajratilgan (ularni klient generatsiya
    // qiladi). Autentifikatsiyasiz (@Public) so'rovda egasi yo'q — kalit
    // e'tiborsiz qoldiriladi, aks holda bir klient boshqasining javobini
    // o'qiy olardi.
    const userId = req.user?.id;
    if (typeof userId !== 'number') return next.handle();

    return from(this.handle(context, next, req, userId, key, method, path));
  }

  private async handle(
    context: ExecutionContext,
    next: CallHandler,
    req: Request & { user?: User },
    userId: number,
    key: string,
    method: string,
    path: string,
  ): Promise<unknown> {
    /* -------- 1-qadam: kalitni band qilish (atomik) -------- */
    let reservedId: number;
    try {
      const inserted = await this.repo.insert({
        key,
        userId,
        clubId: req.user?.clubId ?? null,
        method,
        path,
        responseStatus: null,
        responseBody: null,
      });
      reservedId = inserted.identifiers[0].id as number;
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        return this.replayExisting(key, userId, method, path);
      }
      /**
       * Band qilib bo'lmadi va sabab unique EMAS — eng ehtimolli holat
       * migratsiya yugurtirilmagan (jadval yo'q). Kassa "o'yin boshlash"
       * tugmasini 500 bilan rad etsa, bu himoyaning o'zidan ko'ra ko'proq
       * zarar bo'lardi. Shuning uchun himoya YO'QOLADI, xizmat ISHLAYVERADI,
       * log esa operatorga aniq signal beradi.
       */
      this.logger.error(
        `Idempotentlik jadvali ishlamadi (migratsiya yugurtirilganmi?): ${(err as Error).message}`,
      );
      return firstValueFrom(next.handle());
    }

    /* -------- 2-qadam: amalni bajarish -------- */
    let body: unknown;
    try {
      body = await firstValueFrom(next.handle());
    } catch (err) {
      // Xato javob saqlanmaydi — band qilingan qatorni bo'shatamiz,
      // foydalanuvchi sababni tuzatib qayta yuborishi mumkin bo'lsin
      await this.release(reservedId);
      throw err;
    }

    /* -------- 3-qadam: javobni saqlash -------- */
    const responseStatus = this.resolveStatus(context, method);
    if (responseStatus >= 200 && responseStatus < 300) {
      try {
        await this.repo.update(reservedId, {
          responseStatus,
          responseBody: (body ?? null) as QueryDeepPartialEntity<IdempotencyKey>['responseBody'],
        });
      } catch (err) {
        // Yozib bo'lmadi: band qilingan qator O'Z JOYIDA qoladi, ya'ni
        // takroriy so'rov 409 oladi va amal IKKI MARTA BAJARILMAYDI
        this.logger.error(
          `Idempotentlik javobi saqlanmadi (${method} ${path}): ${(err as Error).message}`,
        );
      }
    } else {
      // 2xx bo'lmagan javob (masalan @HttpCode(3xx)) — saqlanmaydi
      await this.release(reservedId);
    }

    return body;
  }

  /** Kalit allaqachon band: javobi bo'lsa qaytaramiz, bo'lmasa 409 */
  private async replayExisting(
    key: string,
    userId: number,
    method: string,
    path: string,
  ): Promise<unknown> {
    const stored = await this.repo.findOne({ where: { key, userId } });
    if (!stored) {
      // Poyga: qator hozirgina o'chirilgan (amal xato bilan tugagan).
      // Klient qayta urinsin — bu holat juda kam uchraydi.
      throw new ConflictException({ key: 'common.tryAgain' });
    }

    /**
     * Kalit BOSHQA so'rov uchun qayta ishlatilgan bo'lsa — rad etamiz.
     * Aks holda ikkinchi amal UMUMAN BAJARILMASDAN birinchisining javobini
     * olardi va klient "bajarildi" deb ko'rsatib turgan holda serverda hech
     * narsa yozilmagan bo'lardi.
     */
    if (stored.method !== method || stored.path !== path) {
      throw new ConflictException({ key: 'common.validationError' });
    }

    // Javob hali yo'q — AYNI DAMDA boshqa so'rov bajarayapti
    if (stored.responseStatus === null) {
      throw new ConflictException({ key: 'common.tryAgain' });
    }

    return stored.responseBody;
  }

  /** Band qilingan qatorni bo'shatish (xatolar jimgina yutiladi) */
  private async release(id: number): Promise<void> {
    try {
      await this.repo.delete(id);
    } catch (err) {
      this.logger.error(`Idempotentlik kaliti bo'shatilmadi (id=${id}): ${(err as Error).message}`);
    }
  }

  /**
   * Javob holati. `res.statusCode` interceptor bosqichida hali qo'yilmagan
   * (Nest uni handler tugagach o'rnatadi), shuning uchun Nest ning o'zi bilan
   * BIR XIL qoida takrorlanadi: @HttpCode() bo'lsa o'sha, aks holda
   * POST uchun 201, qolganlari uchun 200.
   */
  private resolveStatus(context: ExecutionContext, method: string): number {
    const declared = this.reflector.get<number | undefined>(
      HTTP_CODE_METADATA,
      context.getHandler(),
    );
    if (typeof declared === 'number') return declared;
    return method === 'POST' ? 201 : 200;
  }

  private isUniqueViolation(err: unknown): boolean {
    if (!(err instanceof QueryFailedError)) return false;
    const driverError = err.driverError as { code?: string } | undefined;
    return driverError?.code === PG_UNIQUE_VIOLATION;
  }

  /** Ustun uzunligidan oshgan qiymatni kesish — insert yiqilmasin */
  private trunc(value: string | undefined, max: number): string {
    if (!value) return '';
    return value.length > max ? value.slice(0, max) : value;
  }
}
