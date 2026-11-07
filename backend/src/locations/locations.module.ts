import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../devices/device.entity';
import { LocationPing } from './location-ping.entity';
import { LocationsService } from './locations.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LocationPing, Device])],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
