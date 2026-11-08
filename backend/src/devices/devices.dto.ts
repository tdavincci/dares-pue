import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PageQueryDto } from '../common/dto/pagination.dto';
import { DeviceStatus } from './device.entity';

/** Derived from completed (non-reversed) payments against the pump's price. */
export enum DevicePaymentStatus {
  PAID = 'PAID',
  PARTIAL = 'PARTIAL',
  /** Assigned to a farmer, nothing paid yet. */
  UNPAID = 'UNPAID',
  /** In stock: no farmer and nothing paid. */
  UNASSIGNED = 'UNASSIGNED',
}

const toBool = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : value === true || value === 'true' || value === '1';

export class CreateDeviceDto {
  @ApiProperty({ example: 'PUMP-SPX-000123', description: 'Pump serial number (Odyssey meterId)' })
  @IsString()
  @MaxLength(80)
  serialNumber!: string;

  @ApiProperty({ example: '359339075123456', description: 'Tracker IMEI (as reported in GT06 login packet)' })
  @Matches(/^[0-9]{10,17}$/, { message: 'trackerImei must be 10–17 digits' })
  trackerImei!: string;

  @ApiPropertyOptional({ example: 'GT06N', default: 'GT06' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  trackerModel?: string;

  @ApiPropertyOptional({ example: '+2348091112222' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  trackerSimNumber?: string;

  @ApiPropertyOptional({ example: 'SunFlow 1.5HP DC' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pumpModel?: string;

  @ApiPropertyOptional({ example: '1.5HP / 20m head' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  pumpCapacity?: string;

  @ApiPropertyOptional({ example: 450000, description: 'Full price; payments must equal this amount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 'NGN', default: 'NGN' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({ example: 'DARES-PUE-AGR-0042' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  financingId?: string;

  @ApiPropertyOptional({ enum: DeviceStatus })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  farmerId?: string | null;

  @ApiPropertyOptional({ example: 500, description: 'Allowed distance (m) from the farm point' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(100000)
  geofenceRadiusMeters?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  reportIntervalMinutes?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  installedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDeviceDto extends PartialType(CreateDeviceDto) {}

export class DeviceQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: DeviceStatus })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiPropertyOptional({ description: 'true = reported within ONLINE_THRESHOLD_MINUTES' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  online?: boolean;

  @ApiPropertyOptional({ description: 'false = last fix outside the farm geofence' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  withinGeofence?: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  farmerId?: string;

  @ApiPropertyOptional({
    enum: DevicePaymentStatus,
    description: 'PAID, PARTIAL, UNPAID (assigned, nothing paid) or UNASSIGNED',
  })
  @IsOptional()
  @IsEnum(DevicePaymentStatus)
  paymentStatus?: DevicePaymentStatus;
}

export class LocationHistoryQueryDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'Default: 24h ago' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Default: now' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 2000, maximum: 20000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  limit: number = 2000;
}
