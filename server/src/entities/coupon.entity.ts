import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NumericTransformer } from '../common/transformers/numeric.transformer';
import { CouponType } from './enums';
import { Plan } from './plan.entity';

/**
 * Chegirma kuponi — obuna to'lovlarida qo'llanadi.
 * type=percent: value foizda (0-100), type=fixed: value so'mda.
 */
@Entity('coupons')
export class Coupon {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'enum', enum: CouponType, enumName: 'coupon_type' })
  type: CouponType;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: new NumericTransformer() })
  value: number;

  /** Necha marta ishlatilishi mumkin (NULL — cheksiz) */
  @Column({ type: 'int', nullable: true })
  maxUses: number | null;

  @Column({ type: 'int', default: 0 })
  usedCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  validFrom: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  validTo: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** Faqat ma'lum tarifga tegishli bo'lsa (NULL — barcha tariflar) */
  @Index()
  @Column({ type: 'int', nullable: true })
  planId: number | null;

  @ManyToOne(() => Plan, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'planId' })
  plan: Plan | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
