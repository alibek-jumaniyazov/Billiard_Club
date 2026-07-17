import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BigIntTransformer, NumericTransformer } from '../common/transformers/numeric.transformer';
import { Session } from './session.entity';
import { Table } from './table.entity';

/**
 * Sessiya segmenti — o'yin davomida stol almashtirilganda (transfer)
 * har bir stol/narx oralig'i alohida yozuv bo'ladi. Yakuniy stol summasi =
 * segmentlar bo'yicha sekundlik hisob yig'indisi.
 *
 * HISOB MODELI:
 *  - Segmentlar devor-soat (wall-clock) oraliqlarini yozadi: [startedAt, endedAt ?? sessiya tugashi].
 *  - Pauzalar sessiyada global yuritiladi (pausedAt + totalPausedMs), lekin resume()
 *    har bir pauza davomiyligini JORIY ochiq segmentning pausedMs ustuniga ham qo'shadi.
 *  - Pauzada transfer TAQIQLANGAN, shuning uchun bitta pauza hech qachon segment
 *    chegarasidan oshib o'tmaydi — matematika shu invariantga tayanadi.
 *  - Segment bo'yicha hisob: billedSeconds = floor((min(endedAt ?? now, sessiyaTugashi) - startedAt - pausedMs) / 1000)
 *    summa = round2(pricePerHour * billedSeconds / 3600).
 */
@Entity('session_segments')
export class SessionSegment {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  sessionId: number;

  @ManyToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: Session;

  @Index()
  @Column({ type: 'int' })
  tableId: number;

  @ManyToOne(() => Table, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tableId' })
  table: Table;

  /** Segment boshlanganidagi stol narxi (soatiga) — muhrlangan */
  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: new NumericTransformer() })
  pricePerHour: number;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  /** NULL — segment hali davom etmoqda (joriy stol) */
  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  /**
   * Segment ochiq bo'lgan davrdagi pauzalar yig'indisi (ms) — resume() paytida
   * qo'shib boriladi. Sessiya pauzada yakunlansa, yakunlash joriy pauzani ham qo'shadi.
   */
  @Column({ type: 'bigint', default: 0, transformer: new BigIntTransformer() })
  pausedMs: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
