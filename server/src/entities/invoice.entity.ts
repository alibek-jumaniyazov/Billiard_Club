import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NumericTransformer } from '../common/transformers/numeric.transformer';
import { InvoiceStatus } from './enums';
import { Club } from './club.entity';
import { Contract } from './contract.entity';
import { Coupon } from './coupon.entity';
import { Plan } from './plan.entity';

/**
 * Hisob-faktura — klubning obuna to'lovi yozuvi.
 * pending: klub egasi to'lov so'rovi yuborgan, superadmin tasdig'ini kutmoqda;
 * paid: to'lov qabul qilingan (obuna uzaytirilgan, contractId bog'lanadi).
 */
@Entity('invoices')
@Index('IDX_invoices_club_createdAt', ['clubId', 'createdAt'])
export class Invoice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Index()
  @Column({ type: 'int', nullable: true })
  planId: number | null;

  @ManyToOne(() => Plan, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'planId' })
  plan: Plan | null;

  /** To'lov tasdiqlanganda yaratilgan shartnoma */
  @Index()
  @Column({ type: 'int', nullable: true })
  contractId: number | null;

  @ManyToOne(() => Contract, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'contractId' })
  contract: Contract | null;

  /** Hisob-faktura raqami, masalan: INV-2026-000001 */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 30, unique: true })
  number: string;

  /** To'lanadigan yakuniy summa (chegirma qo'llangandan keyin) */
  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: new NumericTransformer() })
  amount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  discountAmount: number;

  @Index()
  @Column({ type: 'int', nullable: true })
  couponId: number | null;

  @ManyToOne(() => Coupon, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'couponId' })
  coupon: Coupon | null;

  @Index()
  @Column({ type: 'enum', enum: InvoiceStatus, enumName: 'invoice_status', default: InvoiceStatus.PENDING })
  status: InvoiceStatus;

  /** Erkin matn: 'click', 'payme', 'naqd', 'bank' va h.k. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
