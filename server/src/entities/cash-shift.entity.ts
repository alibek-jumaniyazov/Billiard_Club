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
import { NumericTransformer } from '../common/transformers/numeric.transformer';
import { Club } from './club.entity';
import { User } from './user.entity';

/** Smena yakunidagi hisobot (Z-hisobot) — yopilgan paytdagi muhrlangan nusxa */
export interface ShiftSummary {
  from: string;
  to: string;
  /** Shu oraliqda yakunlangan o'yinlar */
  sessionsCount: number;
  tableRevenue: number;
  barRevenue: number;
  /** Hisoblangan summa (chegirmadan keyin) */
  billedRevenue: number;
  discounts: number;
  /** Hisob-kitobda haqiqatda olingan pul */
  collectedSales: number;
  /** Undirilgan qarzlar */
  debtPayments: number;
  /** Jami olingan pul = collectedSales + debtPayments */
  collected: number;
  /** To'lov usullari bo'yicha (naqd/karta/o'tkazma) — hisobotlar bilan bir xil formula */
  byMethod: { cash: number; card: number; transfer: number };
  /** Qarzga yozilgan summa */
  debtsCreated: number;
  /** Shu smenada kiritilgan xarajatlar (ma'lumot uchun) */
  expenses: number;
  /** Hisobot olingan paytdagi faol o'yinlar */
  activeSessions: number;
}

/**
 * Kassa smenasi — kassir smenani boshlang'ich naqd bilan ochadi, yakunda
 * kassadagi pulni sanab yopadi; tizim kutilgan summani hisoblab farqni
 * (kamomad/ortiqcha) ko'rsatadi va Z-hisobotni muhrlaydi.
 *
 * Bitta klubda bir vaqtda faqat BITTA ochiq smena — DB darajasida
 * (qisman unique indeks), ikki kassir parallel ochib qo'ya olmaydi.
 *
 * Xodim nomlari (`openedByName`/`closedByName`) nusxalanadi: xodim keyinchalik
 * o'chirilsa ham tarixiy hisobot kim ochib-yopganini ko'rsatib turadi.
 */
@Entity('cash_shifts')
@Index('IDX_cash_shifts_club_openedAt', ['clubId', 'openedAt'])
@Index('uq_cash_shifts_open_per_club', ['clubId'], { unique: true, where: '"closedAt" IS NULL' })
export class CashShift {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Column({ type: 'int', nullable: true })
  openedById: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'openedById' })
  openedBy: User | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  openedByName: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  openedAt: Date;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: new NumericTransformer() })
  openingCash: number;

  @Column({ type: 'text', nullable: true })
  openingNote: string | null;

  @Column({ type: 'int', nullable: true })
  closedById: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'closedById' })
  closedBy: User | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  closedByName: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  /** Smena davomida kassadan chiqarilgan naqd (kassadan to'langan xarajat, egaga topshirilgan pul) */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: new NumericTransformer() })
  cashOut: number | null;

  /** Kutilgan naqd = boshlang'ich + naqd tushum − chiqim */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: new NumericTransformer() })
  expectedCash: number | null;

  /** Kassir sanagan naqd */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: new NumericTransformer() })
  countedCash: number | null;

  /** Farq = sanalgan − kutilgan (manfiy — kamomad) */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: new NumericTransformer() })
  difference: number | null;

  @Column({ type: 'text', nullable: true })
  closingNote: string | null;

  @Column({ type: 'jsonb', nullable: true })
  summary: ShiftSummary | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
