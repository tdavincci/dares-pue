import 'reflect-metadata';
// Lets the TypeORM CLI (migration:run etc.) read backend/.env too. Never overrides variables already set.
import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import configuration from '../config/configuration';
import { ApiAccessToken, ApiClient } from '../api-clients/api-client.entity';
import { ApiAccessLog } from '../api-clients/api-access-log.entity';
import { Device } from '../devices/device.entity';
import { Farmer } from '../farmers/farmer.entity';
import { LocationPing } from '../locations/location-ping.entity';
import { Payment } from '../payments/payment.entity';
import { User } from '../users/user.entity';

export const ENTITIES = [User, Farmer, Device, LocationPing, Payment, ApiClient, ApiAccessToken, ApiAccessLog];

export function buildDataSourceOptions(): DataSourceOptions {
  const { db } = configuration();
  if (db.url && !/^postgres(ql)?:\/\//i.test(db.url)) {
    throw new Error(
      'DATABASE_URL must be a PostgreSQL connection string (postgresql://user:password@host:5432/db). ' +
        'For Supabase use Connect → "Session pooler", not the https://<ref>.supabase.co project URL.',
    );
  }
  const connection = db.url
    ? { url: db.url }
    : {
        host: db.host,
        port: db.port,
        username: db.username,
        password: db.password,
        database: db.database,
      };
  return {
    type: 'postgres',
    ...connection,
    ssl: db.ssl ? { rejectUnauthorized: false } : false,
    extra: { max: db.poolMax },
    entities: ENTITIES,
    // ts-node (CLI) loads .ts sources; the compiled app loads .js (never .d.ts).
    migrations: [__dirname + (__filename.endsWith('.ts') ? '/migrations/*.ts' : '/migrations/*.js')],
    synchronize: db.synchronize,
    migrationsRun: db.runMigrations && !db.synchronize,
    logging: db.logging,
  };
}

/** Used by the TypeORM CLI (npm run migration:generate / migration:run). */
export default new DataSource(buildDataSourceOptions());
