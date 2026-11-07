import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Farmer } from './farmer.entity';
import { FarmersController } from './farmers.controller';
import { FarmersService } from './farmers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Farmer])],
  controllers: [FarmersController],
  providers: [FarmersService],
  exports: [FarmersService],
})
export class FarmersModule {}
