import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFarmerDto {
  @ApiPropertyOptional({ description: 'Leave empty to auto-generate (DPF-000001…)', example: 'DPF-000001' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  accountNumber?: string;

  @ApiProperty({ example: 'Musa Ibrahim' })
  @IsString()
  @MaxLength(160)
  fullName!: string;

  @ApiProperty({ example: '+2348031234567' })
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: 'phone must be a valid phone number' })
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Adamawa' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  state?: string;

  @ApiPropertyOptional({ example: 'Yola South' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lga?: string;

  @ApiPropertyOptional({ example: 'Namtari' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  community?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Ibrahim Rice Farm' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  farmName?: string;

  @ApiPropertyOptional({ example: 9.2035, description: 'Intended installation latitude (WGS84)' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  farmLatitude?: number;

  @ApiPropertyOptional({ example: 12.4954, description: 'Intended installation longitude (WGS84)' })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  farmLongitude?: number;

  @ApiPropertyOptional({ example: 2.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  farmSizeHectares?: number;

  @ApiPropertyOptional({ example: 'Rice' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  primaryCrop?: string;

  @ApiPropertyOptional({ example: 'IRRIGATION_FARMER', description: 'Sent to Odyssey as customerCategory' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFarmerDto extends PartialType(CreateFarmerDto) {}
