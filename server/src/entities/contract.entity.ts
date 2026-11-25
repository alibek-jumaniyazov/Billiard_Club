import {
  Check,
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

export enum ContractType {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  SEMIANNUAL = 'semiannual',
  YEARLY = 'yearly',
  CUSTOM = 'custom',
}

/**
 * Shartnoma — klub egasi bilan tuzilgan to'lov kelishuvi.
 * Har shartnoma platforma daromadining yozuvi; shartnoma yaratilganda
 * klub obunasi endDate gacha uzaytiriladi.
 */
// DB darajasidagi cheklovlar migratsiyada yaratilgan, lekin metadatada ham
// e'lon qilinishi SHART (aks holda `migration:generate` ularni DROP qiladi).
@Entity('contracts')
@Check('chk_contracts_amount_nonneg', '"amount" >= 0')
@Check('chk_contracts_dates', '"endDate" > "startDate"')
export class Contract {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Klub. Klub butunlay o'chirilganda null bo'ladi — shartnoma platforma daromad
   * tarixi sifatida qoladi (FK ON DELETE SET NULL; nomi `clubName` ga muhrlanadi).
   */
  @Index()
  @Column({ type: 'int', nullable: true })
  clubId: number | null;

  @ManyToOne(() => Club, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'clubId' })
  club: Club | null;

  /** O'chirilgan klubning nomi (tarixda ko'rsatish uchun); tirik klubda null */
  @Column({ type: 'varchar', length: 150, nullable: true })
  clubName: string | null;

  @Column({ type: 'enum', enum: ContractType, enumName: 'contract_type', default: ContractType.MONTHLY })
  type: ContractType;

  /** Shartnoma summasi (platformaga to'langan pul) */
  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: new NumericTransformer() })
  amount: number;

  @Column({ type: 'timestamptz' })
  startDate: Date;

  @Column({ type: 'timestamptz' })
  endDate: Date;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
