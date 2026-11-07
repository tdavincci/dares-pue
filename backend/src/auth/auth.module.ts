import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        secret: c.get<string>('auth.jwtSecret'),
        signOptions: { expiresIn: c.get<string>('auth.jwtExpiresIn') as any },
      }),
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [UsersService, JwtAuthGuard],
  exports: [UsersService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
