import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NumericTransformer } from '../common/transformers/numeric.transformer';
import { Club } from './club.entity';
import { Customer } from './customer.entity';
import { Session } from './session.entity';
import { User } from './user.entity';
import { DebtPayment } from './debt-payment.entity';

// DB darajasidagi cheklov migratsiyada yaratilgan, lekin metadatada ham
// e'lon qilinishi SHART (aks holda `migration:generate` uni DROP qiladi).
@Entity('debts')
@Check(
  'chk_debts_amounts_nonneg',
  '"tableAmount" >= 0 AND "barAmount" >= 0 AND "totalDebt" >= 0 AND "paidAmount" >= 0 AND "remainingDebt" >= 0',
)
export class Debt {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Index()
  @Column({ type: 'int', nullable: true })
  sessionId: number | null;

  @ManyToOne(() => Session, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sessionId' })
  session: Session | null;

  /** Qarzni yozgan xodim (audit) */
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'varchar', length: 100 })
  customerName: string;

  @Index()
  @Column({ type: 'varchar', length: 20, nullable: true })
  customerPhone: string | null;

  /** Ro'yxatdagi mijoz (bo'lsa) — erkin matnli customerName o'rniga */
  @Index()
  @Column({ type: 'int', nullable: true })
  customerId: number | null;

  @ManyToOne(() => Customer, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'customerId' })
  customer: Customer | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  tableAmount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  barAmount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  totalDebt: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  paidAmount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  remainingDebt: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index()
  @Column({ type: 'boolean', default: false })
  isPaid: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  dueDate: Date | null;

  /**
   * HISOBDAN CHIQARISH (write-off) — undirilmagan qarzdan voz kechish.
   *
   * Avval bu amal qatorni QATTIQ o'chirardi va shu sababli o'tgan davr
   * hisoboti keyinchalik O'ZGARIB ketardi: iyul oyida yozilgan qarz avgustda
   * hisobdan chiqarilsa, iyul hisobotidagi "yaratilgan qarzlar" summasi
   * retroaktiv kamayardi — moliyaviy hisobot o'zgarmas (immutable) bo'lmasdi.
   * Ustiga-ustak qarzli sessiya abadiy "to'lanmagan" bo'lib qolardi.
   *
   * Endi qator SAQLANADI: `remainingDebt` nolga tushadi (shu sababli barcha
   * "joriy qarz" yig'indilaridan o'zi chiqib ketadi), `isPaid` esa true bo'ladi.
   * Qachon, kim va nima sababdan chiqargani shu ustunlarda va audit jurnalida
   * qoladi.
   */
  @Column({ type: 'timestamptz', nullable: true })
  writtenOffAt: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  writtenOffReason: string | null;

  /** Hisobdan chiqargan xodim */
  @Column({ type: 'int', nullable: true })
  writtenOffById: number | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => DebtPayment, (payment) => payment.debt)
  payments: DebtPayment[];
}
