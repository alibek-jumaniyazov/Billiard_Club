import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClubBlockReason, ClubStatus } from './enums';
import type { TierCode } from '../common/plan-tiers/tiers';
import { User } from './user.entity';

@Entity('clubs')
// DB darajasidagi cheklovlar migratsiyada (TierPlans, ClubBlockReason) — metadatada ham e'lon qilinadi
@Check('chk_clubs_tier', `"tier" IN ('standard', 'pro', 'vip')`)
@Check(
  'chk_clubs_block_reason',
  `"blockReason" IN ('free_plan_abuse', 'unpaid', 'rules_violation', 'suspicious_activity', 'owner_request', 'other')`,
)
export class Club {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ownerName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Index()
  @Column({ type: 'enum', enum: ClubStatus, enumName: 'club_status', default: ClubStatus.TRIAL })
  status: ClubStatus;

  @Column({ type: 'timestamptz', nullable: true })
  trialEndsAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  subscriptionEndsAt: Date | null;

  /**
   * Tarif darajasi: 'standard' | 'pro' | 'vip' (common/plan-tiers). Imkoniyat va
   * cheklovlar shunga qarab beriladi. To'lov tasdiqlanganda sotib olingan tarif
   * darajasiga o'tadi; sinovdagi klub — platforma sozlamasidagi daraja.
   * Migratsiyagacha bo'lgan klublar 'vip' (hech narsa yopilmaydi).
   */
  @Column({ type: 'varchar', length: 20, default: 'vip' })
  tier: TierCode;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /**
   * Blok sababi (tayyor ro'yxatdan) va klubga ko'rinadigan izoh — ikkalasi
   * ixtiyoriy, bloklangan klub kirganda ekranida chiqadi. `notes` dan farqi:
   * u superadminning ichki eslatmasi, klubga ko'rsatilmaydi. Blokdan
   * chiqarilganda uchala maydon tozalanadi.
   */
  @Column({ type: 'varchar', length: 40, nullable: true })
  blockReason: ClubBlockReason | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  blockNote: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  blockedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => User, (user) => user.club)
  users: User[];

  /** Obunaning amaldagi tugash sanasi (to'lov > sinov) */
  get effectiveEndsAt(): Date | null {
    return this.subscriptionEndsAt ?? this.trialEndsAt;
  }

  get isExpired(): boolean {
    const end = this.effectiveEndsAt;
    return this.status === ClubStatus.EXPIRED || (!!end && new Date(end).getTime() <= Date.now());
  }
}
