import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiAccessToken, ApiClient } from './api-client.entity';
import { ApiClientsController } from './api-clients.controller';
import { ApiClientsService } from './api-clients.service';
import { ApiTokenGuard } from './api-token.guard';

@Module({
  imports: [TypeOrmModule.forFeature([ApiClient, ApiAccessToken])],
  controllers: [ApiClientsController],
  providers: [ApiClientsService, ApiTokenGuard],
  exports: [ApiClientsService, ApiTokenGuard],
})
export class ApiClientsModule {}
