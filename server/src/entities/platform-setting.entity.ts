import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Platforma darajasidagi sozlamalar — kalit/qiymat (jsonb) ombori.
 * Masalan: 'telegram_events' — Telegram hodisalarini yoqish/o'chirish
 * xaritasi (hodisa -> boolean, kalit yo'q bo'lsa yoqilgan deb hisoblanadi).
 */
@Entity('platform_settings')
export class PlatformSetting {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'jsonb' })
  value: unknown;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
