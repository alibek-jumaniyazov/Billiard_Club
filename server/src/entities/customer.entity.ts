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
import { Club } from './club.entity';

/**
 * Mijoz — klubning doimiy mijozlari ro'yxati. Sessiya, qarz va bron
 * yozuvlari shu jadvalga bog'lanadi (erkin matnli customerName o'rniga).
 * Telefon klub ichida unikal (partial index — migratsiyada, phone NOT NULL bo'lsa).
 */
@Entity('customers')
@Index('IDX_customers_club_name', ['clubId', 'name'])
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
