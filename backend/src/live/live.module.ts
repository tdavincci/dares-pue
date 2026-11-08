import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LiveEventsService } from './live-events.service';
import { LiveController } from './live.controller';

/** Global so any service can publish live updates without importing this module. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [LiveController],
  providers: [LiveEventsService],
  exports: [LiveEventsService],
})
export class LiveModule {}
