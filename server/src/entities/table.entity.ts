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
import { LightDriver, TableStatus } from './enums';
import { Club } from './club.entity';
import { Session } from './session.entity';
// Tur entity papkasidan olinadi (drayver modulidan EMAS) — aks holda
// entity -> modul -> entity ko'rinishidagi aylanma import paydo bo'lardi.
// `light-driver.ts` shu turni re-export qiladi, ya'ni shakl bitta joyda.
import type { LightDeviceConfig } from './light-config.type';

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

  /** Chiroq relesi turi — 'none' bo'lsa bu stolda chiroq boshqarilmaydi */
  @Column({ type: 'enum', enum: LightDriver, enumName: 'light_driver', default: LightDriver.NONE })
  lightDriver: LightDriver;

  /**
   * Rele manzili — "192.168.1.51" yoki "192.168.1.51:8080".
   * `select: false` — klubning lokal tarmoq manzillari oddiy stol/sessiya
   * javoblariga chiqmasin (panelda GET /lights orqali ko'rsatiladi).
   */
  @Column({ type: 'varchar', length: 120, nullable: true, select: false })
  lightHost: string | null;

  /** Rele kanali (0 dan boshlanadi) */
  @Column({ type: 'int', default: 0 })
  lightChannel: number;

  /** NC (normally closed) rele uchun — buyruq teskari yuboriladi */
  @Column({ type: 'boolean', default: false })
  lightInverted: boolean;

  /**
   * Rele uchun basic-auth ma'lumoti "user:parol" ko'rinishida.
   * `select: false` — bu MAXFIY qiymat: oddiy `find`/`findOne` javoblariga
   * (GET /tables, GET /sessions dagi `relations: { table: true }` va h.k.)
   * HECH QACHON tushmaydi. Kerak bo'lganda faqat ATAYLAB o'qiladi:
   * `createQueryBuilder('t').addSelect('t.lightAuth')` yoki xom SQL orqali.
   */
  @Column({ type: 'varchar', length: 200, nullable: true, select: false })
  lightAuth: string | null;

  /** driver='http' uchun yoqish shablon URL i (`select: false` — lightHost bilan bir xil sabab) */
  @Column({ type: 'text', nullable: true, select: false })
  lightOnUrl: string | null;

  /** driver='http' uchun o'chirish shablon URL i (`select: false` — lightHost bilan bir xil sabab) */
  @Column({ type: 'text', nullable: true, select: false })
  lightOffUrl: string | null;

  /**
   * Drayverga xos qo'shimcha sozlamalar (Home Assistant `entityId`, ESPHome
   * `entity`, MQTT `topic`/payloadlar, Modbus `unitId`/`coil`, TCP/serial
   * baytlari, qo'shimcha rele kanallari va h.k.) — shakli `LightDeviceConfig`.
   *
   * `select: false` — lightHost/lightAuth bilan bir xil sabab: klubning lokal
   * tarmoq tafsilotlari oddiy `find`/`findOne` javoblariga (GET /tables,
   * sessiyalardagi `relations: { table: true }`) HECH QACHON tushmasligi kerak.
   * Kerak bo'lganda faqat ATAYLAB o'qiladi: `addSelect('t.lightConfig')` yoki
   * xom SQL orqali. Bu ustunga parol/token YOZILMAYDI — ular `lightAuth` da.
   */
  @Column({ type: 'jsonb', nullable: true, select: false })
  lightConfig: LightDeviceConfig | null;

  /** Qo'lda boshqaruv (override) qiymati — sessiya holatidan ustun turadi */
  @Column({ type: 'boolean', nullable: true })
  lightOverrideOn: boolean | null;

  /** Qo'lda boshqaruv shu vaqtgacha kuchda (o'tgach avtomatik holatga qaytadi) */
  @Column({ type: 'timestamptz', nullable: true })
  lightOverrideUntil: Date | null;

  /** Oxirgi ma'lum HAQIQIY holat (agent/server hisobotidan) */
  @Column({ type: 'boolean', nullable: true })
  lightState: boolean | null;

  /** Holat oxirgi marta muvaffaqiyatli qo'llangan vaqt */
  @Column({ type: 'timestamptz', nullable: true })
  lightSyncedAt: Date | null;

  /** Oxirgi xato matni (muvaffaqiyatda tozalanadi) */
  @Column({ type: 'varchar', length: 300, nullable: true })
  lightError: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Session, (session) => session.table)
  sessions: Session[];
}
