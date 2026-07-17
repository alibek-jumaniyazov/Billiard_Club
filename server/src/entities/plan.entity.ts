import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NumericTransformer } from '../common/transformers/numeric.transformer';

/**
 * Obuna tarifi — klub egalariga ko'rsatiladigan narxlar katalogi
 * (oylik / yarim yillik / yillik). Nomlar va tavsiflar uz+ru.
 */
@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  /** Dasturiy identifikator: 'monthly', 'semiannual', 'yearly' */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  nameUz: string;

  @Column({ type: 'varchar', length: 100 })
  nameRu: string;

  @Column({ type: 'text', nullable: true })
  descriptionUz: string | null;

  @Column({ type: 'text', nullable: true })
  descriptionRu: string | null;

  /** Obuna davomiyligi kunlarda */
  @Column({ type: 'int' })
  durationDays: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: new NumericTransformer() })
  price: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /** Tarif imkoniyatlari ro'yxati (UI da ko'rsatish uchun) */
  @Column({ type: 'jsonb', nullable: true })
  features: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
