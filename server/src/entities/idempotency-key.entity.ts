import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Idempotentlik kaliti — bir marta bajarilgan mutatsiyaning natijasi.
 *
 * MUAMMO. Oflayn navbat (client/src/offline/queue.ts) har bir amalga bir
 * martalik `Idempotency-Key` biriktiradi va JAVOB KELMASA amalni qayta
 * yuboradi. Lekin so'rov serverga yetib borib, faqat javob yo'lda yo'qolgan
 * bo'lishi ham mumkin — u holda qayta yuborish PULNI IKKI MARTA yozardi
 * (ikkinchi to'lov, ikkinchi qarz to'lovi, ikkinchi buyurtma).
 *
 * YECHIM. Kalit amal BAJARILISHIDAN OLDIN band qilinadi (unique indeks
 * hisobiga bu atomik), amal tugagach esa javob shu qatorga yoziladi. O'sha
 * kalit bilan kelgan keyingi so'rov handler ni UMUMAN bajarmasdan saqlangan
 * javobni aynan qaytaradi.
 *
 * NEGA "oldin band qilish" SHART: aks holda ikkita bir xil so'rov bir vaqtda
 * kelganda (birinchisi hali javob qaytarmagan, klient esa qayta yuborgan)
 * IKKALASI HAM handler ni bajarardi va pul ikki marta yozilardi — aynan shu
 * jadval oldini olmoqchi bo'lgan holat. Band qilingan, lekin hali javobi
 * yo'q kalit `responseStatus IS NULL` bilan belgilanadi.
 *
 * Kalit foydalanuvchi doirasida unikal (key + userId): kalitlarni klient
 * generatsiya qiladi, shuning uchun bir foydalanuvchining kaliti boshqasining
 * javobini o'g'irlab bo'lmasligi kerak.
 *
 * Yozuvlar 48 soatdan keyin kunlik cron bilan o'chiriladi — oflayn navbat
 * bundan uzoq kutmaydi, jadval esa cheksiz o'smaydi.
 *
 * FK ataylab YO'Q (audit_logs bilan bir xil qoida): xodim o'chirilsa ham
 * kalit yozuvi tozalash cron igacha o'z ishini bajarib turaveradi.
 */
@Entity('idempotency_keys')
@Index('uq_idempotency_keys_key_user', ['key', 'userId'], { unique: true })
@Index('IDX_idempotency_keys_createdAt', ['createdAt'])
export class IdempotencyKey {
  @PrimaryGeneratedColumn()
  id: number;

  /** Klient bergan kalit (`Idempotency-Key` sarlavhasi) */
  @Column({ type: 'varchar', length: 100 })
  key: string;

  /** Kalit egasi — kalitlar foydalanuvchi doirasida ajratilgan */
  @Column({ type: 'int' })
  userId: number;

  /** Tenant konteksti (superadmin so'rovlarida null) */
  @Column({ type: 'int', nullable: true })
  clubId: number | null;

  /**
   * Metod va yo'l — bir xil kalit BOSHQA amalga qo'yilgan bo'lsa buni
   * aniqlash uchun saqlanadi (diagnostika; qayta ishlatish taqiqlanadi).
   */
  @Column({ type: 'varchar', length: 10 })
  method: string;

  @Column({ type: 'varchar', length: 500 })
  path: string;

  /**
   * Saqlangan javobning HTTP holati (faqat 2xx saqlanadi).
   * NULL — kalit band qilingan, lekin amal hali TUGAMAGAN (yoki xato bilan
   * tugab, javob saqlanmagan). Bu holat qayta yuborishdan himoya qiladi.
   */
  @Column({ type: 'int', nullable: true })
  responseStatus: number | null;

  /**
   * Javob tanasi — qayta yuborishda AYNAN shu qaytariladi.
   * Ustun jsonb: istalgan JSON qiymat sig'adi; tur `Record` deb e'lon
   * qilingan, chunki API javoblari obyekt ({ data: ... }) ko'rinishida
   * (audit_logs.meta bilan bir xil qoida).
   */
  @Column({ type: 'jsonb', nullable: true })
  responseBody: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
