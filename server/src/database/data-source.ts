import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ALL_ENTITIES } from '../entities';

dotenv.config({ path: path.join(__dirname, '../../.env') });

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
  //  - max: bir vaqtda 20 ta ulanish (Postgres standart 100 limitiga sig'adi)
  //  - connectionTimeoutMillis: DB ko'tarilmagan bo'lsa 5 s dan keyin xato
  //  - statement_timeout: og'ir hisobot so'rovi 15 s da uziladi
  //  - idle_in_transaction_session_timeout: ochiq qolgan tranzaksiya
  //    qulflarni cheksiz ushlab turmaydi
  //  - keepAlive: NAT/router uzoq turgan ulanishni jimgina yopib qo'ymasin
  extra: {
    max: 20,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 15000,
    keepAlive: true,
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
  },
});
