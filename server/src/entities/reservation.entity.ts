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
import { ReservationStatus } from './enums';
import { Club } from './club.entity';
import { Customer } from './customer.entity';
import { Table } from './table.entity';

/**
 * Bron — stolni oldindan band qilish. Mijoz ro'yxatdan bo'lsa customerId,
 * bo'lmasa erkin matnli customerName/customerPhone ishlatiladi.
 */
@Entity('reservations')
@Index('IDX_reservations_club_startsAt', ['clubId', 'startsAt'])
@Index('IDX_reservations_table_startsAt', ['tableId', 'startsAt'])
export class Reservation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Column({ type: 'int' })
  tableId: number;

  @ManyToOne(() => Table, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tableId' })
  table: Table;

  @Index()
  @Column({ type: 'int', nullable: true })
  customerId: number | null;

  @ManyToOne(() => Customer, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'customerId' })
  customer: Customer | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  customerName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  customerPhone: string | null;

  /** Bron boshlanish vaqti */
  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'int', nullable: true })
  durationMinutes: number | null;

  @Index()
  @Column({
    type: 'enum',
    enum: ReservationStatus,
    enumName: 'reservation_status',
    default: ReservationStatus.PENDING,
  })
  status: ReservationStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
