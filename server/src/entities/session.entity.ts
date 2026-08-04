import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BigIntTransformer, NumericTransformer } from '../common/transformers/numeric.transformer';
import { PaymentMethod, SessionStatus } from './enums';
import { Club } from './club.entity';
import { Customer } from './customer.entity';
import { Table } from './table.entity';
import { User } from './user.entity';
import { Order } from './order.entity';
import { Sale } from './sale.entity';
import { SessionSegment } from './session-segment.entity';
import { SessionPayment } from './session-payment.entity';

// DB darajasidagi cheklovlar migratsiyada yaratilgan, lekin metadatada ham
// e'lon qilinishi SHART: aks holda kelajakdagi `migration:generate` ularni
// "ortiqcha" deb hisoblab DROP qiladigan migratsiya yozadi.
@Entity('sessions')
@Check(
  'chk_sessions_amounts_nonneg',
  '"tableAmount" >= 0 AND "barAmount" >= 0 AND "totalAmount" >= 0 AND "totalPausedMs" >= 0',
)
// Bitta stolda bir vaqtda faqat bitta faol/pauzadagi sessiya (poyga himoyasi)
@Index('uq_sessions_one_active_per_table', ['tableId'], {
  unique: true,
  where: `"status" IN ('active', 'paused')`,
})
// Chiroq "grace" mantiqi stolning OXIRGI yakunlangan sessiyasini qidiradi —
// unga qisman indeks kerak (1784247700000-LightControlPro migratsiyasi)
@Index('IDX_sessions_table_endTime_finished', ['tableId', 'endTime'], {
  where: `status IN ('completed', 'cancelled')`,
})
export class Session {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Index()
  @Column({ type: 'int' })
  tableId: number;

  @ManyToOne(() => Table, (table) => table.sessions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tableId' })
  table: Table;

  /** Sessiyani boshlagan xodim */
  @Index()
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  customerName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  customerPhone: string | null;

  /** Ro'yxatdagi mijoz (bo'lsa) — erkin matnli customerName o'rniga */
  @Index()
  @Column({ type: 'int', nullable: true })
  customerId: number | null;

  @ManyToOne(() => Customer, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'customerId' })
  customer: Customer | null;

  /**
   * Sessiya boshlanganidagi stol narxi (soatiga) — hisob shu narxda yuritiladi,
   * stol narxi keyin o'zgartirilsa ham yakuniy hisob o'zgarmaydi.
   */
  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: new NumericTransformer(),
  })
  pricePerHour: number | null;

  @Index()
  @Column({ type: 'timestamptz', default: () => 'now()' })
  startTime: Date;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  endTime: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  pausedAt: Date | null;

  @Column({ type: 'bigint', default: 0, transformer: new BigIntTransformer() })
  totalPausedMs: number;

  @Column({ type: 'int', nullable: true })
  durationMinutes: number | null;

  /** Faol o'yin davomiyligi soniyalarda — sekundlik aniqlikdagi hisob uchun */
  @Column({ type: 'int', nullable: true })
  durationSeconds: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  tableAmount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  barAmount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  totalAmount: number;

  @Index()
  @Column({ type: 'enum', enum: SessionStatus, enumName: 'session_status', default: SessionStatus.ACTIVE })
  status: SessionStatus;

  @Column({ type: 'enum', enum: PaymentMethod, enumName: 'payment_method', nullable: true })
  paymentMethod: PaymentMethod | null;

  @Column({ type: 'boolean', default: false })
  isPaid: boolean;

  /** Qo'lda tuzatish: musbat — ustama, manfiy — chegirma (sabab majburiy) */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  adjustmentAmount: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  adjustmentReason: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Order, (order) => order.session)
  orders: Order[];

  @OneToOne(() => Sale, (sale) => sale.session)
  sale: Sale | null;

  /** Stol/narx segmentlari (transfer tarixi) — hisob shu segmentlar bo'yicha */
  @OneToMany(() => SessionSegment, (segment) => segment.session)
  segments: SessionSegment[];

  /** Bo'lib to'lash yozuvlari (split payment) */
  @OneToMany(() => SessionPayment, (payment) => payment.session)
  payments: SessionPayment[];
}
