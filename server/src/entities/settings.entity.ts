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
import { LightMode } from './enums';
import { Club } from './club.entity';

/** Har bir klub uchun bitta sozlamalar yozuvi (clubId unique) */
// DB darajasidagi cheklovlar migratsiyada yaratilgan, lekin metadatada ham
// e'lon qilinishi SHART (aks holda `migration:generate` ularni DROP qiladi).
@Entity('settings')
@Check('chk_settings_light_off_delay', '"lightOffDelaySec" >= 0 AND "lightOffDelaySec" <= 3600')
@Check('chk_settings_light_pre_on', '"lightPreOnMinutes" >= 0 AND "lightPreOnMinutes" <= 120')
@Check('chk_settings_light_force_sync', '"lightForceSyncSec" >= 10 AND "lightForceSyncSec" <= 3600')
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

  /**
   * Sessiya tugagach chiroq yana shuncha SONIYA yoniq qoladi (0..3600).
   * Mijoz stoldan turgan zahoti zal qorong'i bo'lib qolmasligi uchun —
   * kassir hisob-kitob qilib bo'lguncha chiroq o'chmaydi. 0 — darhol o'chadi.
   */
  @Column({ type: 'int', default: 0 })
  lightOffDelaySec: number;

  /**
   * Bron boshlanishidan shuncha DAQIQA oldin chiroq yoqiladi (0..120).
   * Mehmon kelganda stol allaqachon tayyor bo'ladi. 0 — o'chiq (yoqilmaydi).
   */
  @Column({ type: 'int', default: 0 })
  lightPreOnMinutes: number;

  /**
   * Majburiy qayta qo'llash oralig'i, SONIYA (10..3600). Holat o'zgarmagan
   * bo'lsa ham shu oraliqda buyruq qayta yuboriladi — rele elektr uzilishidan
   * keyin o'zicha boshqa holatga tushib qolsa, tiklanadi.
   */
  @Column({ type: 'int', default: 60 })
  lightForceSyncSec: number;

  /**
   * Qurilmadan HAQIQIY holatni o'qib tekshirish (majburiy sinxronizatsiyada).
   * Farq topilsa (drift) buyruq darhol qayta qo'llanadi. Holat o'qishni
   * qo'llab-quvvatlamaydigan qurilmalarda bu sozlama zararsiz.
   */
  @Column({ type: 'boolean', default: true })
  lightVerify: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
