import { Module } from '@nestjs/common';
import { Gt06Server } from './gt06/gt06.server';
import { IngestController } from './ingest.controller';

@Module({
  controllers: [IngestController],
  providers: [Gt06Server],
  exports: [Gt06Server],
})
export class IngestModule {}
