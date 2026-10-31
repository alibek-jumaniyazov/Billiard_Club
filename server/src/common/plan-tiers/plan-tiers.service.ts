import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Club } from '../../entities/club.entity';
import { PlatformSetting } from '../../entities/platform-setting.entity';
import {
  DEFAULT_TIERS,
  Entitlements,
  FeatureKey,
  LimitKey,
  TIER_CODES,
  TiersConfig,
  entitlementsFor,
  isTierCode,
  minTierFor,
  minTierForLimit,
  normalizeTiers,
  shapeTiers,
  tierViolations,
} from './tiers';

/** platform_settings dagi kalit */
export const PLAN_TIERS_KEY = 'plan_tiers';

/** HAR so'rovda o'qiladi (SubscriptionGuard) — kesh shart; update() uni darhol yangilaydi */
const CACHE_TTL_MS = 60 * 1000;

/**
 * TARIF DARAJALARI SOZLAMASI (superadmin panelida tahrirlanadi).
 * Saqlash platform_settings da — PlatformConfigService bilan bir xil naqsh.
 * O'qish HECH QACHON yiqilmaydi: DB yetib bo'lmasa — oxirgi kesh yoki standart.
 */
@Injectable()
export class PlanTiersService {
  private readonly logger = new Logger(PlanTiersService.name);
  private cache: { value: TiersConfig; loadedAt: number } | null = null;

  constructor(@InjectRepository(PlatformSetting) private readonly repo: Repository<PlatformSetting>) {}

  async get(): Promise<TiersConfig> {
    const now = Date.now();
    if (this.cache && now - this.cache.loadedAt < CACHE_TTL_MS) return this.cache.value;
    try {
      const row = await this.repo.findOne({ where: { key: PLAN_TIERS_KEY } });
      const value = normalizeTiers(row?.value ?? DEFAULT_TIERS);
      this.cache = { value, loadedAt: now };
      return value;
    } catch (err) {
      this.logger.error(`Tarif darajalari o'qilmadi: ${(err as Error).message}`);
      return this.cache?.value ?? normalizeTiers(DEFAULT_TIERS);
    }
  }

  /**
   * To'liq sozlamani saqlash. Qoidaga zid kiritma (masalan VIP da Pro dagi
   * imkoniyat o'chirilgan) RAD ETILADI — jimgina "tuzatib" saqlanmaydi.
   */
  async update(raw: unknown): Promise<TiersConfig> {
    const next = this.parseStrict(raw);
    await this.repo.upsert({ key: PLAN_TIERS_KEY, value: next }, ['key']);
    this.cache = { value: next, loadedAt: Date.now() };
    this.logger.log('Tarif darajalari yangilandi');
    return next;
  }

  async entitlements(club: Pick<Club, 'tier'>): Promise<Entitlements> {
    const config = await this.get();
    return entitlementsFor(config, isTierCode(club.tier) ? club.tier : 'vip');
  }

  async hasFeature(club: Pick<Club, 'tier'>, feature: FeatureKey): Promise<boolean> {
    return (await this.entitlements(club)).features[feature];
  }

  /** Imkoniyat yo'q bo'lsa 403 FEATURE_LOCKED — xabarda kerakli daraja nomi */
  async assertFeature(club: Pick<Club, 'tier'>, feature: FeatureKey): Promise<void> {
    const config = await this.get();
    const tier = isTierCode(club.tier) ? club.tier : 'vip';
    if (config[tier].features[feature]) return;
    const needed = minTierFor(config, feature);
    throw new ForbiddenException({
      key: needed ? 'subscription.featureLocked' : 'subscription.featureDisabled',
      code: 'FEATURE_LOCKED',
      args: needed ? { tier: config[needed].nameUz, tierRu: config[needed].nameRu } : {},
    });
  }

  /**
   * Yangi narsa qo'shishdan oldin: `current` — hozir nechta bor.
   * Cheklovga yetgan bo'lsa 403 LIMIT_REACHED.
   */
  async assertLimit(club: Pick<Club, 'tier'>, key: LimitKey, current: number): Promise<void> {
    const config = await this.get();
    const tier = isTierCode(club.tier) ? club.tier : 'vip';
    const max = config[tier].limits[key];
    if (max === null || current < max) return;
    const next = minTierForLimit(config, key, current + 1);
    const base = key === 'tables' ? 'subscription.tableLimit' : 'subscription.staffLimit';
    throw new ForbiddenException({
      // Yuqoriroq darajada ham joy bo'lmasa — "tarifni oshiring" emas, "bog'laning"
      key: next ? base : `${base}Top`,
      code: 'LIMIT_REACHED',
      args: next ? { max, tier: config[next].nameUz, tierRu: config[next].nameRu } : { max },
    });
  }

  private parseStrict(raw: unknown): TiersConfig {
    if (!raw || typeof raw !== 'object') throw new BadRequestException({ key: 'subscription.tiersInvalid' });
    const source = raw as Record<string, unknown>;
    for (const code of TIER_CODES) {
      if (!source[code] || typeof source[code] !== 'object') {
        throw new BadRequestException({ key: 'subscription.tiersInvalid' });
      }
    }
    // Faqat shaklga keltiriladi (qoidaga EMAS) — ziddiyat yashirinmasin, rad etilsin
    const shaped = shapeTiers(source);
    if (tierViolations(shaped).length) {
      throw new BadRequestException({ key: 'subscription.tiersInvalid' });
    }
    return shaped;
  }
}
