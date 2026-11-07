import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import configuration from '../config/configuration';
import { ApiAccessToken, ApiClient } from '../api-clients/api-client.entity';
import { Device } from '../devices/device.entity';
import { Farmer } from '../farmers/farmer.entity';
import { LocationPing } from '../locations/location-ping.entity';
import { Payment } from '../payments/payment.entity';
import { User } from '../users/user.entity';

export const ENTITIES = [User, Farmer, Device, LocationPing, Payment, ApiClient, ApiAccessToken];

export function buildDataSourceOptions(): DataSourceOptions {
  const { db } = configuration();
  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.username,
    password: db.password,
    database: db.database,
    ssl: db.ssl ? { rejectUnauthorized: false } : false,
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
