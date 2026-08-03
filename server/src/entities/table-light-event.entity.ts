import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Club } from './club.entity';
import { Table } from './table.entity';
import { User } from './user.entity';

/**
 * Chiroq diagnostika jurnali — "nega bu stolda chiroq yonmadi?" degan savolga
 * javob beradigan yagona joy.
 *
 * Yozuv HAR BIR sinxronizatsiyada emas, faqat MA'NOLI hodisada qo'shiladi:
 * holat haqiqatan o'zgarganda, xato bo'lganda yoki qo'lda aralashuvda.
 * Aks holda majburiy sinxronizatsiya (har daqiqa) jadvalni behuda to'ldirardi.
 *
 * Saqlash muddati — 30 kun (kunlik cron eski yozuvlarni o'chiradi), shuning
 * uchun indekslar "eng yangisi birinchi" ko'rinishiga moslangan.
 *
 * Stol o'chirilsa jurnali ham o'chadi (tableId CASCADE), klub esa o'chirilishi
 * mumkin emas (clubId RESTRICT — boshqa jadvallar bilan bir xil qoida).
 * Foydalanuvchi o'chirilsa yozuv qoladi, faqat `userId` NULL ga tushadi.
 */
@Entity('table_light_events')
@Index('IDX_light_events_club_at', ['clubId', 'at'])
@Index('IDX_light_events_table_at', ['tableId', 'at'])
// Kunlik tozalash FAQAT "at" bo'yicha filtrlaydi (klubsiz) — migratsiyada shu
// indeks bor, entity ham uni e'lon qiladi: aks holda migration:generate uni
// "ortiqcha" deb DROP qilishga urinardi.
@Index('IDX_light_events_at', ['at'])
export class TableLightEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clubId' })
  club: Club;

  @Column({ type: 'int' })
  tableId: number;

  @ManyToOne(() => Table, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tableId' })
  table: Table;

  /** Hodisa vaqti — DB `now()` beradi (server soatiga tayanilmaydi) */
  @CreateDateColumn({ type: 'timestamptz' })
  at: Date;

  /** Qo'llangan MANTIQIY holat (yoniq/o'chiq); xato bo'lsa null */
  @Column({ type: 'boolean', nullable: true })
  isOn: boolean | null;

  /**
   * Hodisa sababi:
   * 'session'  — sessiya holati o'zgardi (avtomatik)
   * 'override' — bitta stolda qo'lda boshqaruv
   * 'master'   — "hammasini yoqish/o'chirish" tugmasi
   * 'test'     — paneldan sinov buyrug'i
   * 'sync'     — agent/cron hisoboti bo'yicha holat o'zgardi
   * 'drift'    — qurilmadagi haqiqiy holat kerakli holatdan farq qilib, tuzatildi
   * 'settings' — klub sozlamasi o'zgargani uchun qayta qo'llandi
   */
  @Column({ type: 'varchar', length: 16 })
  source: string;

  @Column({ type: 'boolean', default: true })
  ok: boolean;

  /**
   * Xato matni. Bu maydon PANELGA ko'rinadi, shuning uchun unga faqat qisqa
   * sabab (masalan "HTTP 401 Unauthorized") yoziladi — qurilma javobining
   * TANASI hech qachon yozilmaydi (LightHttpError.body faqat server logida).
   */
  @Column({ type: 'varchar', length: 300, nullable: true })
  error: string | null;

  /** Amalni bajargan foydalanuvchi — avtomatik hodisalarda null */
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;
}
