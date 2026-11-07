import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserRole } from '../users/user.entity';
import { ApiClientsService } from './api-clients.service';

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
  constructor(private readonly svc: ApiClientsService) {}

  @Get()
  list() {
    return this.svc.list();
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
