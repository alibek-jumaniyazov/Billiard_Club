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
import { FeedbackPriority, FeedbackStatus, FeedbackType } from './enums';
import { Club } from './club.entity';
import { User } from './user.entity';

/**
 * Fikr-mulohaza markazi — klublardan keladigan taklif / shikoyat /
 * xatolik / yangi imkoniyat so'rovlari. Superadmin javob yozadi (reply)
 * va holatini boshqaradi (unread -> read -> resolved/rejected).
 */
@Entity('feedbacks')
@Index('IDX_feedbacks_status_createdAt', ['status', 'createdAt'])
@Index('IDX_feedbacks_club_createdAt', ['clubId', 'createdAt'])
export class Feedback {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  /** Yuborgan foydalanuvchi */
  @Index()
  @Column({ type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: FeedbackType, enumName: 'feedback_type' })
  type: FeedbackType;

  @Column({
    type: 'enum',
    enum: FeedbackPriority,
    enumName: 'feedback_priority',
    default: FeedbackPriority.MEDIUM,
  })
  priority: FeedbackPriority;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 200 })
  subject: string;

  @Column({ type: 'text' })
  message: string;

  /** Biriktirilgan fayllar ro'yxati (URL/path lar) */
  @Column({ type: 'jsonb', nullable: true })
  attachments: string[] | null;

  @Column({
    type: 'enum',
    enum: FeedbackStatus,
    enumName: 'feedback_status',
    default: FeedbackStatus.UNREAD,
  })
  status: FeedbackStatus;

  /** Superadmin javobi */
  @Column({ type: 'text', nullable: true })
  reply: string | null;

  @Column({ type: 'int', nullable: true })
  repliedById: number | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'repliedById' })
  repliedBy: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  repliedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
