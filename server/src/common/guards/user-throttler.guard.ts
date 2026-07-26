import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerOptions } from '@nestjs/throttler';

/**
 * @Throttle() da ishlatiladigan limit NOMI. Ataylab 'default' emas:
 * global ThrottlerGuard (APP_GUARD) faqat 'default' nomli limitni biladi,
 * shu sababli marshrutdagi qat'iy limit u yerda IP kaliti bilan qayta
 * hisoblanmaydi — global (IP bo'yicha) xulq o'zgarishsiz qoladi.
 */
export const USER_THROTTLER = 'user';

/** Marshrut @Throttle() bermasa ishlatiladigan zaxira qiymatlar */
const FALLBACK_TTL_MS = 15 * 60 * 1000;
const FALLBACK_LIMIT = 500;

/**
 * Foydalanuvchiga bog'langan rate-limit.
 *
 * MUAMMO: global ThrottlerGuard JwtAuthGuard dan OLDIN ishlaydi va kalit
 * sifatida IP oladi. Hujjatlarda tavsiya etilgan reverse proxy (nginx/Caddy)
 * ortida, TRUST_PROXY qo'yilmagan bo'lsa, barcha so'rovlar BITTA proxy IP si
 * bo'lib ko'rinadi — ya'ni marshrutdagi qat'iy limit butun platforma uchun
 * umumiy bo'lib qoladi (bitta klub limitni hammaga tugatib qo'yadi).
 *
 * YECHIM: bu guard marshrut darajasida (@UseGuards) ulanadi — global
 * guardlardan KEYIN ishlaydi, demak req.user allaqachon to'ldirilgan va
 * limit har bir foydalanuvchi uchun alohida sanaladi.
 *
 * Foydalanish:
 *   @Throttle({ [USER_THROTTLER]: { limit: 10, ttl: 60 * 60 * 1000 } })
 *   @UseGuards(UserThrottlerGuard)
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  /**
   * Bu guard FAQAT USER_THROTTLER nomli limitni tekshiradi: global limitni
   * APP_GUARD dagi ThrottlerGuard allaqachon hisoblagan, aks holda har bir
   * so'rov ikki marta sanalgan bo'lardi.
   */
  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    const base: ThrottlerOptions | undefined = this.throttlers[0];
    this.throttlers = [
      {
        ...base,
        name: USER_THROTTLER,
        ttl: base?.ttl ?? FALLBACK_TTL_MS,
        limit: base?.limit ?? FALLBACK_LIMIT,
      },
    ];
  }

  /**
   * Kalit — autentifikatsiyalangan foydalanuvchi. req.user bo'lmasa
   * (kutilmagan holat) IP ga qaytamiz, limit umuman yo'qolib qolmasin.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = (req?.user as { id?: number } | undefined)?.id;
    return userId != null ? `user-${userId}` : (req?.ip ?? 'unknown');
  }
}
