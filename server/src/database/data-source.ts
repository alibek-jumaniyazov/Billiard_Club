import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ALL_ENTITIES } from '../entities';

dotenv.config({ path: path.join(__dirname, '../../.env') });

/** Muhit o'zgaruvchisidan butun son (yo'q yoki noto'g'ri bo'lsa — standart, chegarada) */
const envInt = (name: string, fallback: number, min: number, max: number): number => {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'prime_billiard',
  entities: ALL_ENTITIES,
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  // Sxemaning yagona manbai — migratsiyalar. synchronize HECH QACHON yoqilmaydi.
  synchronize: false,
  logging: false,
  // pg pool va sessiya chegaralari — osilib qolgan so'rov butun serverni
  // ushlab qolmasin:
  //  - max: bir vaqtda 20 ta ulanish (Postgres standart 100 limitiga sig'adi), DB_POOL_MAX
  //  - min + idleTimeoutMillis: kamida 2 ta ulanish doim TAYYOR turadi, qolganlari
  //    1 daqiqa ishlatilmasa yopiladi. Avval (min 0, 10 s) jimlikdan keyingi deyarli
  //    har so'rov YANGI ulanish ochardi — baza bir lahza sekinlashsa aynan shu
  //    "Connection terminated due to connection timeout" xatosini berardi
  //  - connectionTimeoutMillis: yangi ulanish 8 s ichida ochilmasa xato (DB_CONNECT_TIMEOUT_MS);
  //    bir marta avtomatik qayta uriniladi (common/db/pool-retry.ts) — jami ~16 s,
  //    klientning 20 s lik so'rov muddatiga sig'adi
  //  - statement_timeout: og'ir hisobot so'rovi 15 s da uziladi
  //  - idle_in_transaction_session_timeout: ochiq qolgan tranzaksiya
  //    qulflarni cheksiz ushlab turmaydi
  //  - keepAlive: NAT/router uzoq turgan ulanishni jimgina yopib qo'ymasin
  //  - application_name: pg_stat_activity da serverning ulanishlari ko'rinib tursin
  extra: {
    max: envInt('DB_POOL_MAX', 20, 2, 200),
    min: envInt('DB_POOL_MIN', 2, 0, 20),
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: envInt('DB_CONNECT_TIMEOUT_MS', 8000, 1000, 60_000),
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 15000,
    keepAlive: true,
    application_name: 'billiardclub-server',
  },
  ...(process.env.NODE_ENV === 'production' && process.env.DB_SSL === 'true'
    ? { ssl: { rejectUnauthorized: true } }
    : {}),
};

/**
 * MIGRATSIYA uchun alohida DataSource (TypeORM CLI shuni ishlatadi).
 *
 * Nega alohida: yuqoridagi `statement_timeout: 15000` ilova so'rovlari uchun
 * to'g'ri, lekin MIGRATSIYAGA halokatli bo'lardi — katta jadvalda
 * `CREATE INDEX` yoki `ALTER TABLE` 15 soniyadan uzoq davom etishi mumkin va
 * u YARIM YO'LDA uzilib, sxemani noaniq holatda qoldirardi.
 * Shuning uchun bu yerda so'rov muddati o'chirilgan (0 = cheksiz), ulanish
 * muddati esa saqlanadi.
 */
export const AppDataSource = new DataSource({
  ...dataSourceOptions,
  extra: {
    ...(dataSourceOptions as { extra?: Record<string, unknown> }).extra,
    statement_timeout: 0,
    idle_in_transaction_session_timeout: 0,
    max: 2,
    // Migratsiya CLI tugagach jarayon kutib qolmasin
    min: 0,
    application_name: 'billiardclub-migrations',
  },
});
