import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LeadStatus } from './enums';

/**
 * Landing arizasi — "bepul konsultatsiya" formasidan kelgan potensial mijoz.
 *
 * Klubga bog'lanmaydi (hali klub yo'q): bu platforma egasining savdo
 * voronkasi. Superadmin holatni yuritadi (yangi -> bog'lanildi ->
 * mijozga aylandi / rad etildi) va ichki izoh yozadi.
 *
 * `ip`/`userAgent` — faqat spamni aniqlash uchun; API ularni qaytarmaydi.
 */
@Entity('leads')
@Index('IDX_leads_status_createdAt', ['status', 'createdAt'])
export class Lead {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 32 })
  phone: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  clubName: string | null;

  @Column({ type: 'int', nullable: true })
  tablesCount: number | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  /** Ariza qoldirilgan interfeys tili — qo'ng'iroq qaysi tilda bo'lishini bildiradi */
  @Column({ type: 'varchar', length: 2, nullable: true })
  lang: string | null;

  @Column({ type: 'varchar', length: 30, default: 'landing' })
  source: string;

  @Column({ type: 'enum', enum: LeadStatus, enumName: 'lead_status', default: LeadStatus.NEW })
  status: LeadStatus;

  /** Superadminning ichki izohi (qo'ng'iroq natijasi va h.k.) */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  ip: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true, select: false })
  userAgent: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
