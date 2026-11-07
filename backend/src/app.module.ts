import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiClientsModule } from './api-clients/api-clients.module';
import { AuthModule } from './auth/auth.module';
import configuration from './config/configuration';
import { DashboardController } from './dashboard/dashboard.controller';
import { buildDataSourceOptions } from './database/data-source';
import { DevicesModule } from './devices/devices.module';
import { FarmersModule } from './farmers/farmers.module';
import { IngestModule } from './ingest/ingest.module';
import { LocationsModule } from './locations/locations.module';
import { OdysseyModule } from './odyssey/odyssey.module';
import { PaymentsModule } from './payments/payments.module';

@ApiTags('Health')
@Controller('health')
class HealthController {
  constructor(private readonly ds: DataSource) {}

  @Get()
  async health() {
    await this.ds.query('SELECT 1');
    return { status: 'ok', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions() }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    AuthModule,
    LocationsModule,
    FarmersModule,
    DevicesModule,
    PaymentsModule,
    ApiClientsModule,
    OdysseyModule,
    IngestModule,
  ],
  controllers: [HealthController, DashboardController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
