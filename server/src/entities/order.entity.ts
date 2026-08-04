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
import { OrderStatus } from './enums';
import { Club } from './club.entity';
import { Session } from './session.entity';
import { Table } from './table.entity';
import { User } from './user.entity';
import { OrderItem } from './order-item.entity';

// DB darajasidagi cheklovlar migratsiyada yaratilgan, lekin metadatada ham
// e'lon qilinishi SHART: aks holda kelajakdagi `migration:generate` ularni
// "ortiqcha" deb hisoblab DROP qiladigan migratsiya yozadi.
@Entity('orders')
@Check('chk_orders_amount_nonneg', '"totalAmount" >= 0')
// Bitta sessiyada bir vaqtda faqat bitta OCHIQ buyurtma (poyga himoyasi)
@Index('uq_orders_one_open_per_session', ['sessionId'], {
  unique: true,
  where: `"status" = 'open' AND "sessionId" IS NOT NULL`,
})
// Buyurtmalar sahifasi va hisobotlar klub + sana oynasi bo'yicha so'raydi
@Index('IDX_orders_club_createdAt', ['clubId', 'createdAt'])
export class Order {
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

  @ManyToOne(() => Session, (session) => session.orders, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sessionId' })
  session: Session | null;

  @Index()
  @Column({ type: 'int', nullable: true })
  tableId: number | null;

  @ManyToOne(() => Table, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'tableId' })
  table: Table | null;

  /** Buyurtmani kiritgan xodim (audit) */
  @Index()
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  totalAmount: number;

  @Index()
  @Column({ type: 'enum', enum: OrderStatus, enumName: 'order_status', default: OrderStatus.OPEN })
  status: OrderStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => OrderItem, (item) => item.order)
  items: OrderItem[];
}
