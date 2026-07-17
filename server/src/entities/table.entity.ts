import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NumericTransformer } from '../common/transformers/numeric.transformer';
import { TableStatus } from './enums';
import { Club } from './club.entity';
import { Session } from './session.entity';

@Entity('tables')
export class Table {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'int' })
  number: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: new NumericTransformer() })
  pricePerHour: number;

  @Index()
  @Column({ type: 'enum', enum: TableStatus, enumName: 'table_status', default: TableStatus.FREE })
  status: TableStatus;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Session, (session) => session.table)
  sessions: Session[];
}
