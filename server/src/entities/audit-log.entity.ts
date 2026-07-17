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

/**
 * Audit jurnali — kim, qachon, nima qilgani (login, obuna uzaytirish,
 * sessiya tuzatish va h.k.). Klub yoki foydalanuvchi o'chirilsa ham
 * yozuv saqlanib qoladi (clubId SET NULL, userId oddiy ustun — FK yo'q).
 */
@Entity('audit_logs')
@Index('IDX_audit_logs_club_createdAt', ['clubId', 'createdAt'])
@Index('IDX_audit_logs_action_createdAt', ['action', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  clubId: number | null;

  @ManyToOne(() => Club, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'clubId' })
  club: Club | null;

  /** Amalni bajargan foydalanuvchi (ataylab FK siz — jurnal o'chmasin) */
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  actorRole: string | null;

  /** Masalan: 'login', 'club.extend', 'session.adjust' */
  @Column({ type: 'varchar', length: 100 })
  action: string;

  /** Ta'sir qilingan obyekt turi (masalan: 'session', 'club') */
  @Column({ type: 'varchar', length: 50, nullable: true })
  entity: string | null;

  @Column({ type: 'int', nullable: true })
  entityId: number | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  method: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  path: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  /** Qo'shimcha kontekst (eski/yangi qiymatlar va h.k.) */
  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
