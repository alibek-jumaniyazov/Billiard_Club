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
import { PaymentMethod } from './enums';
import { Club } from './club.entity';
import { Debt } from './debt.entity';
import { User } from './user.entity';

/**
 * Qarz to'lovlari tarixi — har bir qisman to'lov alohida yozuv
 * (kim, qachon, qancha, qanday usulda qabul qilgani bilan).
 */
@Entity('debt_payments')
export class DebtPayment {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  debtId: number;

  @ManyToOne(() => Debt, (debt) => debt.payments, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'debtId' })
  debt: Debt;

  @Index()
  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  /** To'lovni qabul qilgan xodim */
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: new NumericTransformer() })
  amount: number;

  @Column({ type: 'enum', enum: PaymentMethod, enumName: 'payment_method', default: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
