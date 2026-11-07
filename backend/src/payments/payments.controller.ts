import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserRole } from '../users/user.entity';
import { CreatePaymentDto, PaymentQueryDto, ReversePaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Admin · Payments')
@ApiBearerAuth('admin-jwt')
@UseGuards(JwtAuthGuard)
@Controller('admin/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(@Query() q: PaymentQueryDto) {
    return this.payments.list(q);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.findOne(id);
  }

  @Post()
  @Roles(UserRole.OPERATOR)
  @ApiOperation({ summary: 'Record a full payment for a pump' })
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.create(dto, user.id);
  }

  @Post(':id/reverse')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reverse (void) a payment recorded in error' })
  reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReversePaymentDto) {
    return this.payments.reverse(id, dto.reason);
  }
}
