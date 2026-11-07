import { Module } from '@nestjs/common';
import { ApiClientsModule } from '../api-clients/api-clients.module';
import { OdysseyController } from './odyssey.controller';
import { OdysseyService } from './odyssey.service';

@Module({
  imports: [ApiClientsModule],
  controllers: [OdysseyController],
  providers: [OdysseyService],
})
export class OdysseyModule {}
