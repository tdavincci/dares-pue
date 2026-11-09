import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PageQueryDto } from '../common/dto/pagination.dto';
import { Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserRole } from '../users/user.entity';
import { ApiAccessLogService } from './api-access-log.service';
import { ApiClientsService } from './api-clients.service';

class AccessLogQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ description: 'true = successful requests only, false = failed only' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : value === true || value === 'true'))
  @IsBoolean()
  success?: boolean;

  @ApiPropertyOptional({ enum: ['readings', 'payments', 'token-renewal'] })
  @IsOptional()
  @IsIn(['readings', 'payments', 'token-renewal'])
  endpoint?: string;
}

class CreateApiClientDto {
  @ApiProperty({ example: 'Odyssey Energy Solutions' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'DARES PUE monitoring integration' })
  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateApiClientDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

class IssueTokenDto {
  @ApiPropertyOptional({ example: 'Odyssey production' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ example: 365, description: 'Omit for a non-expiring token' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number;
}

@ApiTags('Admin · API Clients')
@ApiBearerAuth('admin-jwt')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/api-clients')
export class ApiClientsController {
  constructor(
    private readonly svc: ApiClientsService,
    private readonly accessLog: ApiAccessLogService,
  ) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get('access-log')
  @ApiOperation({ summary: 'History of requests made to the Odyssey Standard API (newest first)' })
  history(@Query() q: AccessLogQueryDto) {
    return this.accessLog.list(q);
  }

  @Post()
  create(@Body() dto: CreateApiClientDto) {
    return this.svc.create(dto.name, dto.description);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateApiClientDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/tokens')
  @ApiOperation({ summary: 'Issue an access token (shown once). Give it to Odyssey as the Bearer token.' })
  issue(@Param('id', ParseUUIDPipe) id: string, @Body() dto: IssueTokenDto) {
    return this.svc.issueStaticToken(id, dto.label, dto.expiresInDays);
  }

  @Delete(':id/tokens/:tokenId')
  @HttpCode(204)
  revoke(@Param('id', ParseUUIDPipe) id: string, @Param('tokenId', ParseUUIDPipe) tokenId: string) {
    return this.svc.revokeToken(id, tokenId);
  }

  @Post(':id/refresh-token')
  @ApiOperation({ summary: 'Issue a refresh token for the token-renewal flow (shown once; replaces previous)' })
  refresh(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.issueRefreshToken(id);
  }

  @Delete(':id/refresh-token')
  @HttpCode(204)
  revokeRefresh(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.revokeRefreshToken(id);
  }
}
