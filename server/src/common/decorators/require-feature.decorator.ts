import { SetMetadata } from '@nestjs/common';
import type { FeatureKey } from '../plan-tiers/tiers';

export const REQUIRE_FEATURE_KEY = 'requireFeature';
/**
 * Endpoint (yoki butun controller) klub tarifida shu imkoniyat bo'lsagina
 * ishlaydi — aks holda SubscriptionGuard 403 FEATURE_LOCKED qaytaradi.
 * Superadmin (klubni ko'rish rejimi) tekshirilmaydi.
 */
export const RequireFeature = (feature: FeatureKey) => SetMetadata(REQUIRE_FEATURE_KEY, feature);
