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
import { PaymentMethod } from './enums';
import { Club } from './club.entity';
import { Sale } from './sale.entity';
import { Session } from './session.entity';

/**
 * Sessiya to'lovi — bo'lib to'lash (split payment) uchun: bitta hisob
 * bir nechta usulda (naqd + karta) to'lanishi mumkin, har biri alohida yozuv.
 * Sale endi sarlavha (header), summalar shu jadvaldan yig'iladi.
 */
@Entity('session_payments')
@Index('IDX_session_payments_club_createdAt', ['clubId', 'createdAt'])
export class SessionPayment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Index()
  @Column({ type: 'int' })
  sessionId: number;

  @ManyToOne(() => Session, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sessionId' })
  session: Session;

  @Index()
  @Column({ type: 'int', nullable: true })
  saleId: number | null;

  @ManyToOne(() => Sale, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'saleId' })
  sale: Sale | null;

  @Column({ type: 'enum', enum: PaymentMethod, enumName: 'payment_method', default: PaymentMethod.CASH })
  method: PaymentMethod;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: new NumericTransformer() })
  amount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
