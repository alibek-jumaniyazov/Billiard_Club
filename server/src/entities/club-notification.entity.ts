import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Club } from './club.entity';
import { User } from './user.entity';

/**
 * Klub xabarnomasi — superadmindan klublarga yuboriladigan xabarlar.
 * Global e'lonlar har bir klubga alohida yozuv sifatida tarqatiladi
 * (fan-out), shunda har klub o'zi uchun o'qilgan/o'qilmagan holatini yuritadi.
 */
@Entity('club_notifications')
@Index('IDX_club_notifications_club_readAt', ['clubId', 'readAt'])
export class ClubNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** Masalan: 'info', 'warning', 'promo', 'maintenance' */
  @Column({ type: 'varchar', length: 30, default: 'info' })
  type: string;

  /** Yuborgan superadmin */
  @Column({ type: 'int', nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: User | null;

  /** NULL — hali o'qilmagan */
  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
