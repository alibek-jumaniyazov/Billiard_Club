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
 * Klubning lokal tarmog'idagi chiroq agenti (bridge).
 * Agent serverga O'ZI chiqadi (outbound HTTPS) va X-Bridge-Token headeri bilan
 * tanitiladi — router sozlash yoki statik IP kerak emas. Xom token DB da
 * saqlanmaydi, faqat uning sha256 xeshi (tokenHash) yoziladi.
 * Har bir klubda bitta bridge (clubId unique).
 */
@Entity('club_bridges')
export class ClubBridge {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'int', unique: true })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Column({ type: 'varchar', length: 100, default: 'Asosiy bridge' })
  name: string;

  /** Bridge tokenining sha256 xeshi (hex) — token o'zi hech qachon saqlanmaydi */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  /** Agent oxirgi marta murojaat qilgan vaqt (onlayn/oflayn ko'rsatkichi) */
  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  /** Agent bildirgan versiya (report so'rovidan) */
  @Column({ type: 'varchar', length: 30, nullable: true })
  agentVersion: string | null;

  /** Agent so'rovi kelgan oxirgi IP */
  @Column({ type: 'varchar', length: 60, nullable: true })
  lastIp: string | null;

  /** O'chirilgan bridge tokeni qabul qilinmaydi */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // ---------------------------------------------------------------------------
  // Agentga beriladigan vazifa (hozircha faqat qurilma qidirish).
  // Navbat ATAYLAB DB da: ko'p instansiyali deployda vazifa xotirada qolsa
  // uni boshqa instansiyaga kelgan agent hech qachon ko'rmasdi, panel esa
  // `queued: true` deb aldab qo'yardi. Vazifa tasdiqlanmaguncha (natija kelmaguncha
  // yoki muddati o'tmaguncha) shu yerda TURADI — javob yo'qolsa qayta beriladi.
  // ---------------------------------------------------------------------------

  /** Bajarilishi kutilayotgan vazifa identifikatori (natija shu id bilan qaytadi) */
  @Column({ type: 'varchar', length: 40, nullable: true })
  pendingTaskId: string | null;

  /** Vazifa turi ('discover') */
  @Column({ type: 'varchar', length: 16, nullable: true })
  pendingTaskType: string | null;

  /** Skanerlanadigan pastki tarmoq ('192.168.1'); null — agent o'zi aniqlaydi */
  @Column({ type: 'varchar', length: 20, nullable: true })
  pendingTaskSubnet: string | null;

  /** Vazifa navbatga qo'yilgan vaqt (3 daqiqadan keyin muddati o'tadi) */
  @Column({ type: 'timestamptz', nullable: true })
  pendingTaskAt: Date | null;

  /** Agent vazifani oxirgi marta OLGAN vaqt (60 s dan keyin qayta beriladi) */
  @Column({ type: 'timestamptz', nullable: true })
  taskStartedAt: Date | null;

  /** Oxirgi qidiruv natijasi kelgan vaqt */
  @Column({ type: 'timestamptz', nullable: true })
  lastDiscoverAt: Date | null;

  /** Oxirgi qidiruv natijasi: `{ subnet, devices }` (vaqtinchalik yordamchi ma'lumot) */
  @Column({ type: 'jsonb', nullable: true })
  lastDiscover: { subnet?: string | null; devices?: unknown[] } | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
