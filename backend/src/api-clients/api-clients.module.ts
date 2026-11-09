import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiAccessLog } from './api-access-log.entity';
import { ApiAccessLogMiddleware } from './api-access-log.middleware';
import { ApiAccessLogService } from './api-access-log.service';
import { ApiAccessToken, ApiClient } from './api-client.entity';
import { ApiClientsController } from './api-clients.controller';
import { ApiClientsService } from './api-clients.service';
import { ApiTokenGuard } from './api-token.guard';

@Module({
  imports: [TypeOrmModule.forFeature([ApiClient, ApiAccessToken, ApiAccessLog])],
  controllers: [ApiClientsController],
  providers: [ApiClientsService, ApiTokenGuard, ApiAccessLogService, ApiAccessLogMiddleware],
  exports: [ApiClientsService, ApiTokenGuard, ApiAccessLogService, ApiAccessLogMiddleware],
})
export class ApiClientsModule {}
