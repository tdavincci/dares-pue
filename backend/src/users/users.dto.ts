import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from './user.entity';

export class CreateUserDto {
  @ApiProperty({ example: 'officer@dares-pue.ng' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Aisha Mohammed' })
  @IsString()
  @MaxLength(160)
  fullName!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.OPERATOR })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['email'] as const)) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
