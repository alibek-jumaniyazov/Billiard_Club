import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ReleasePlatform } from './enums';

/**
 * Desktop dastur relizi — o'rnatgich faylining metama'lumoti.
 *
 * NEGA O'Z SERVERIMIZDA: fayllar GitHub Releases da emas, aynan shu serverda
 * turadi. Sabablari:
 *  - Yuklab olish manzili doimo bitta: billiardclub.uz/download
 *  - Klub xodimi GitHub akkaunti yoki repozitoriy haqida hech narsa bilmaydi
 *  - Auto-update feed ham shu yerdan boqiladi — tashqi xizmatga bog'liqlik yo'q
 *
 * Faylning O'ZI diskda (RELEASES_DIR), bazada faqat metama'lumot: bazani
 * yuzlab megabaytlik binar bilan shishirish zaxira nusxa olishni ham,
 * migratsiyani ham og'irlashtirardi.
 */
@Entity('app_releases')
// "Har bir platforma uchun eng so'nggi NASHR ETILGAN reliz" so'rovi — eng
// tez-tez bajariladigan so'rov (har bir /download ochilishida va har bir
// auto-update tekshiruvida), shuning uchun aynan shu tartibda indeks.
@Index('IDX_app_releases_platform_published', ['platform', 'isPublished', 'publishedAt'])
@Index('uq_app_releases_platform_version', ['platform', 'version'], { unique: true })
export class AppRelease {
  @PrimaryGeneratedColumn()
  id: number;

  /** Semver: "1.0.1". electron-updater aynan shu qiymatni solishtiradi. */
  @Column({ type: 'varchar', length: 30 })
  version: string;

  @Column({ type: 'enum', enum: ReleasePlatform })
  platform: ReleasePlatform;

  /** Foydalanuvchi ko'radigan asl nom: "Billiard Club Setup 1.0.1.exe" */
  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  /**
   * Diskdagi nom — bo'sh joysiz va tozalangan ("billiard-club-1.0.1-win.exe").
   *
   * ATAYLAB asl nomdan ajratilgan: `fileName` da bo'sh joy va kirill bo'lishi
   * mumkin, u esa URL ga tushganda electron-updater tomonida kodlash
   * muammosini keltirib chiqarardi. Diskdagi nom esa hech qachon
   * foydalanuvchidan kelmaydi — server o'zi hosil qiladi (path traversal yo'q).
   */
  @Column({ type: 'varchar', length: 255, unique: true })
  storedName: string;

  /** Fayl hajmi (bayt). int4 ga 2 GB dan katta fayl sig'masdi — bigint. */
  @Column({ type: 'bigint' })
  size: string;

  /**
   * SHA-512, base64 — electron-updater `latest.yml` da AYNAN shu formatni
   * kutadi va yuklab olgach o'zi tekshiradi. Mos kelmasa yangilanishni rad
   * etadi, ya'ni yo'lda almashtirilgan fayl o'rnatilmaydi.
   */
  @Column({ type: 'varchar', length: 128 })
  sha512: string;

  @Column({ type: 'text', nullable: true })
  notesUz: string | null;

  @Column({ type: 'text', nullable: true })
  notesRu: string | null;

  /**
   * Nashr etilganmi. `false` bo'lsa fayl serverda turadi, lekin /download da
   * ham, auto-update feed'ida ham KO'RINMAYDI — yuklab qo'yib, sinab ko'rib,
   * keyin bir tugma bilan hammaga ochish uchun.
   */
  @Column({ type: 'boolean', default: false })
  isPublished: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  /** Yuklab olishlar soni (statistika uchun) */
  @Column({ type: 'int', default: 0 })
  downloads: number;

  /** Kim yuklagan (superadmin) — FK siz, foydalanuvchi o'chsa ham iz qolsin */
  @Column({ type: 'int', nullable: true })
  uploadedById: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
