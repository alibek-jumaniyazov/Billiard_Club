import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NumericTransformer } from '../common/transformers/numeric.transformer';
import type { TierCode } from '../common/plan-tiers/tiers';

/**
 * Obuna tarifi — klub egalariga ko'rsatiladigan narxlar katalogi:
 * daraja (Standart / Pro / VIP) × muddat (1 / 3 / 6 / 12 oy). Nomlar uz+ru.
 */
// DB darajasidagi cheklov migratsiyada yaratilgan, lekin metadatada ham
// e'lon qilinishi SHART (aks holda `migration:generate` uni DROP qiladi).
@Entity('plans')
@Check('chk_plans_valid', '"price" >= 0 AND "durationDays" > 0')
@Check('chk_plans_tier', `"tier" IN ('standard', 'pro', 'vip')`)
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  /** Dasturiy identifikator: masalan 'standard_1m', 'pro_6m', 'vip_12m' */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  /**
   * Qaysi daraja sotiladi (Standart / Pro / VIP). Bir daraja 1, 3, 6, 12 oylik —
   * to'rt alohida qator; to'lov tasdiqlanganda klub shu darajaga o'tadi.
   */
  @Index('IDX_plans_tier')
  @Column({ type: 'varchar', length: 20, default: 'standard' })
  tier: TierCode;

  @Column({ type: 'varchar', length: 100 })
  nameUz: string;

  @Column({ type: 'varchar', length: 100 })
  nameRu: string;

  @Column({ type: 'text', nullable: true })
  descriptionUz: string | null;

  @Column({ type: 'text', nullable: true })
  descriptionRu: string | null;

  /** Obuna davomiyligi kunlarda */
  @Column({ type: 'int' })
  durationDays: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: new NumericTransformer() })
  price: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /** Tarif imkoniyatlari ro'yxati (UI da ko'rsatish uchun) */
  @Column({ type: 'jsonb', nullable: true })
  features: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
