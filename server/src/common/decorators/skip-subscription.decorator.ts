import { SetMetadata } from '@nestjs/common';

export const SKIP_SUBSCRIPTION_KEY = 'skipSubscription';
/**
 * Obuna tekshiruvidan o'tkazilmaydigan endpointlar —
 * masalan /auth/me va /auth/logout, aks holda muddati tugagan klub
 * foydalanuvchisi blok ekranida o'z holatini ham ko'ra olmaydi.
 */
export const SkipSubscription = () => SetMetadata(SKIP_SUBSCRIPTION_KEY, true);
