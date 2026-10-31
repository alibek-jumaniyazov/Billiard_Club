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
import { ClubStatus } from './enums';
import type { TierCode } from '../common/plan-tiers/tiers';
import { User } from './user.entity';

@Entity('clubs')
// DB darajasidagi cheklov migratsiyada (TierPlans) — metadatada ham e'lon qilinadi
@Check('chk_clubs_tier', `"tier" IN ('standard', 'pro', 'vip')`)
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
