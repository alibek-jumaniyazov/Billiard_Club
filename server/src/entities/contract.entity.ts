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
@Entity('contracts')
export class Contract {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

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
