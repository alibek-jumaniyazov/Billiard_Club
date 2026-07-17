import {
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

@Entity('orders')
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
