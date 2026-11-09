import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ApiAccessLogMiddleware } from '../api-clients/api-access-log.middleware';
import { ApiClientsModule } from '../api-clients/api-clients.module';
import { OdysseyController } from './odyssey.controller';
import { OdysseyService } from './odyssey.service';

@Module({
  imports: [ApiClientsModule],
  controllers: [OdysseyController],
  providers: [OdysseyService],
})
export class OdysseyModule implements NestModule {
  /** Every Odyssey request (including ones rejected by the token guard) goes into the access history. */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiAccessLogMiddleware).forRoutes(OdysseyController);
  }
}
