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
import { Club } from './club.entity';
import { User } from './user.entity';

/**
 * Xarajat — klubning chiqimlari (ijara, kommunal, mahsulot xaridi va h.k.).
 * Daromad/xarajat hisobotlari uchun asos.
 */
@Entity('expenses')
@Index('IDX_expenses_club_spentAt', ['clubId', 'spentAt'])
export class Expense {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  /** Xarajatni kiritgan xodim */
  @Index()
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  /** Masalan: 'ijara', 'kommunal', 'mahsulot', 'boshqa' */
  @Column({ type: 'varchar', length: 50 })
  category: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: new NumericTransformer() })
  amount: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Xarajat amalda qilingan sana (kiritilgan sanadan farq qilishi mumkin) */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  spentAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
