import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PageQueryDto } from '../common/dto/pagination.dto';
import { UserRole } from '../users/user.entity';
import { CreateFarmerDto, UpdateFarmerDto } from './farmers.dto';
import { FarmersService } from './farmers.service';

@ApiTags('Admin · Farmers')
@ApiBearerAuth('admin-jwt')
@UseGuards(JwtAuthGuard)
@Controller('admin/farmers')
export class FarmersController {
  constructor(private readonly farmers: FarmersService) {}

  @Get()
  list(@Query() q: PageQueryDto) {
    return this.farmers.list(q);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.farmers.findOne(id);
  }

  @Post()
  @Roles(UserRole.OPERATOR)
  create(@Body() dto: CreateFarmerDto) {
    return this.farmers.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.OPERATOR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFarmerDto) {
    return this.farmers.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.farmers.remove(id);
  }
}
