import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { User } from '../../entities/user.entity';
import { AuditService } from './audit.service';

/**
 * OFLAYN AMALLARNI JURNALGA YOZISH.
 *
 * Klientning oflayn navbati har bir qayta yuborishga `X-Offline-Origin`
 * sarlavhasini qo'yadi — amal internetsiz paytda NAVBATGA QO'YILGAN vaqt.
 * Bu interceptor shu sarlavhali MUVAFFAQIYATLI mutatsiyalarni jurnalga
 * yozadi.
 *
 * NEGA KERAK. Oflayn kiritilgan yozuv bazada oddiy yozuvdek ko'rinadi va
 * "bu 3 soat oldin, internetsiz paytda kiritilgan" degan ma'lumot hech
 * qayerda qolmasdi. Nizoli holatda (kassir summani noto'g'ri kiritdi,
 * o'yin vaqti bahsli) aynan shu farq hal qiluvchi bo'ladi.
 *
 * `driftMs` — klient aytgan vaqt bilan server qabul qilgan vaqt orasidagi
 * farq. Katta manfiy qiymat klient soati NOTO'G'RI ekanini bildiradi
 * (kelajakka surilgan) va u tekshirishga arziydigan belgi.
 *
 * Fire-and-forget: jurnal yozuvidagi xato biznes oqimini HECH QACHON
 * to'xtatmaydi (AuditService ning o'z qoidasi).
 */
@Injectable()
export class OfflineAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const raw = request.headers?.['x-offline-origin'];
    if (!raw) return next.handle();

    const method = String(request.method || '').toUpperCase();
    // O'qish so'rovlari navbatga tushmaydi — bu himoya sarlavha qo'lda
    // qo'yilgan holat uchun (jurnal keraksiz yozuvlar bilan to'lmasin)
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next.handle();

    const queuedAtMs = Number(raw);
    const user = request.user as User | undefined;

    return next.handle().pipe(
      // FAQAT muvaffaqiyatli amal yoziladi: rad etilgan so'rov hech narsa
      // o'zgartirmagan va uni "oflayn kiritilgan yozuv" deb belgilash
      // jurnalni chalg'itardi (xatolar allaqachon boshqa yo'l bilan ko'rinadi).
      tap(() => {
        const receivedAt = Date.now();
        const valid = Number.isFinite(queuedAtMs) && queuedAtMs > 0;
        this.audit.log({
          action: 'offline.replay',
          clubId: request.clubId ?? user?.clubId ?? null,
          userId: user?.id ?? null,
          actorRole: user?.role ?? null,
          method,
          path: request.originalUrl ?? request.url ?? null,
          ip: request.ip ?? null,
          userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
          meta: {
            queuedAt: valid ? new Date(queuedAtMs).toISOString() : null,
            receivedAt: new Date(receivedAt).toISOString(),
            /** Amal necha ms navbatda kutgan (manfiy = klient soati oldinda) */
            driftMs: valid ? receivedAt - queuedAtMs : null,
          },
        });
      }),
    );
  }
}
