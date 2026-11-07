import { Body, Controller, Get, HttpCode, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { UsersService } from '../users/users.service';
import { AuthUser, CurrentUser } from './auth.decorators';
import { JwtAuthGuard } from './jwt-auth.guard';

class LoginDto {
  @ApiProperty({ example: 'admin@dares-pue.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString()
  password!: string;
}

class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

class LoginResponse {
  @ApiProperty() accessToken!: string;
  @ApiProperty() user!: AuthUser;
}

@ApiTags('Admin · Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: LoginResponse })
  async login(@Body() dto: LoginDto): Promise<LoginResponse> {
    const user = await this.users.findByEmailWithPassword(dto.email.trim());
    if (!user || !user.isActive || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.users.touchLogin(user.id);
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role });
    return { accessToken, user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName } };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('admin-jwt')
  me(@CurrentUser() user: AuthUser) {
    return this.users.findById(user.id);
  }

  @Post('change-password')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('admin-jwt')
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    const full = await this.users.findByIdWithPassword(user.id);
    if (!full || !(await bcrypt.compare(dto.currentPassword, full.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.users.setPassword(user.id, dto.newPassword);
  }
}
