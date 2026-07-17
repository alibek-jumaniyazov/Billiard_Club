import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Refresh token sessiyasi — har bir qurilma/kirish uchun alohida yozuv.
 * Token rotatsiyasi (har yangilashda eski jti bekor bo'ladi), o'g'irlangan
 * tokenni qayta ishlatishni aniqlash (familyId bo'yicha butun oila bekor
 * qilinadi) va qurilma bo'yicha alohida chiqish (logout) uchun asos.
 */
@Entity('refresh_sessions')
export class RefreshSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Tokenning unikal identifikatori (JWT jti claim) */
  @Index({ unique: true })
  @Column({ type: 'uuid', unique: true })
  jti: string;

  /** Rotatsiya zanjiri (oila) — reuse aniqlansa butun oila bekor qilinadi */
  @Index()
  @Column({ type: 'uuid' })
  familyId: string;

  /** Refresh tokenning sha256 xeshi — token o'zi hech qachon saqlanmaydi */
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Bekor qilingan vaqt (logout / reuse / parol almashtirish) */
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** Rotatsiyada o'rniga chiqarilgan yangi tokenning jti si */
  @Column({ type: 'uuid', nullable: true })
  rotatedToJti: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
