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
  ...(process.env.NODE_ENV === 'production' && process.env.DB_SSL === 'true'
    ? { ssl: { rejectUnauthorized: true } }
    : {}),
};

export const AppDataSource = new DataSource(dataSourceOptions);
