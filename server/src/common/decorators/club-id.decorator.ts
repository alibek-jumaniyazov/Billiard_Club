import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Joriy so'rovning klub konteksti (tenant).
 * Oddiy foydalanuvchilar uchun — o'z klubi (SubscriptionGuard o'rnatadi).
 * Superadmin uchun — X-Club-Id header orqali istalgan klubni ko'rish mumkin.
 * Klub konteksti bo'lmasa so'rov rad etiladi (ma'lumot sizib chiqmasligi uchun).
 */
export const ClubId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest();
    const clubId = request.clubId;
    if (!clubId) {
      throw new ForbiddenException({ key: 'subscription.clubContextRequired' });
    }
    return clubId;
  },
);
