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
import { LightMode } from './enums';
import { Club } from './club.entity';

/** Har bir klub uchun bitta sozlamalar yozuvi (clubId unique) */
@Entity('settings')
export class Settings {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'int', unique: true })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Column({ type: 'varchar', length: 150, default: 'Billiard Club' })
  clubName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 10, default: 'UZS' })
  currency: string;

  @Column({ type: 'varchar', length: 10, default: "so'm" })
  currencySymbol: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 15000, transformer: new NumericTransformer() })
  defaultTablePrice: number;

  @Column({ type: 'varchar', length: 5, default: '10:00' })
  workingHoursStart: string;

  @Column({ type: 'varchar', length: 5, default: '02:00' })
  workingHoursEnd: string;

  /** Klub vaqt mintaqasi — "bugun/hafta/oy" chegaralari shu bo'yicha hisoblanadi */
  @Column({ type: 'varchar', length: 50, default: 'Asia/Tashkent' })
  timezone: string;

  @Column({ type: 'text', nullable: true })
  logo: string | null;

  /** Chiroq boshqaruv rejimi — standart 'off' (butunlay o'chiq, opt-in imkoniyat) */
  @Column({ type: 'enum', enum: LightMode, enumName: 'light_mode', default: LightMode.OFF })
  lightMode: LightMode;

  /** Sessiya pauzada bo'lganda chiroq o'chirilsinmi (standart: yoniq qoladi) */
  @Column({ type: 'boolean', default: false })
  lightOffOnPause: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
