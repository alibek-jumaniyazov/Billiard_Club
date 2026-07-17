import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NumericTransformer } from '../common/transformers/numeric.transformer';
import { PaymentMethod } from './enums';
import { Club } from './club.entity';
import { Session } from './session.entity';
import { User } from './user.entity';

/**
 * Hisob-kitob yozuvi — sessiya yakunida HAQIQATDA to'langan pul.
 * totalAmount = qarzga yozilgan qism chiqarilgan, chegirma qo'llangan summa.
 * Tushum hisobotlari: sales + debt_payments (to'lov sanasiga ko'ra).
 */
@Entity('sales')
export class Sale {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Index({ unique: true })
  @Column({ type: 'int', unique: true })
  sessionId: number;

  @OneToOne(() => Session, (session) => session.sale, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sessionId' })
  session: Session;

  /** Pulni qabul qilgan kassir (audit) */
  @Index()
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  tableAmount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  barAmount: number;

  /** Haqiqatda qabul qilingan pul */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  totalAmount: number;

  @Index()
  @Column({ type: 'enum', enum: PaymentMethod, enumName: 'payment_method', default: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  discount: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
