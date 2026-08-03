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
 *
 * O'QILGANLIK KLUB DARAJASIDA. `readAt` yozuvning o'zida turadi, ya'ni bitta
 * klubda bir nechta admin bo'lsa, birinchi o'qigan hammasi uchun o'qigan
 * bo'lib qoladi. Bu — ataylab qabul qilingan soddalashtirish (foydalanuvchi
 * darajasi uchun alohida `club_notification_reads` jadvali kerak bo'lardi).
 */
@Entity('club_notifications')
@Index('IDX_club_notifications_club_readAt', ['clubId', 'readAt'])
@Index('IDX_club_notifications_club_createdAt', ['clubId', 'createdAt'])
@Index('IDX_club_notifications_createdAt', ['createdAt'])
@Index('IDX_club_notifications_batchId', ['batchId'])
export class ClubNotification {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Bitta yuborishning (fan-out) guruh kaliti — e'lonni N ta klub yozuvidan
   * ajratib turadi: superadmin tarixi shu ustun bo'yicha guruhlanadi.
   *
   * Ustunda DB DEFAULT bor va bu ATAYLAB: batchId BERMAYDIGAN ishlab
   * chiqaruvchi (FeedbackService.reply) hech qanday o'zgarishsiz ishlaydi,
   * uning yozuvi tabiiy ravishda bitta qabul qiluvchili "batch" bo'lib
   * ko'rinadi. Standart qiymatni O'CHIRMANG.
   */
  @Column({
    type: 'uuid',
    default: () => `md5(random()::text || clock_timestamp()::text)::uuid`,
  })
  batchId: string;

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
