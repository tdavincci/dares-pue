import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * Shapes in this file mirror the Odyssey Standard API (OES Standard API v1.0.0) exactly —
 * same schema names, same field names, same types (note latitude/longitude are strings).
 * Our domain mapping:  meter = water pump (meterId = pump serial number),
 * reading = GPS position fix reported by the pump's tracker.
 */

@ApiSchema({ name: 'Meter' })
export class OdysseyMeter {
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-05-16T14:16:01.350Z',
    description: 'GPS fix time (UTC)',
  })
  timestamp!: string;

  @ApiProperty({ example: 'PUMP-SPX-000123', description: 'Pump serial number' })
  meterId!: string;

  @ApiPropertyOptional({
    type: Number,
    format: 'double',
    description: 'Not applicable to water pump trackers — omitted.',
  })
  energyConsumptionKwh?: number;

  @ApiPropertyOptional({
    type: Number,
    format: 'double',
    description: 'Not applicable to water pump trackers — omitted.',
  })
  energyReadingKwh?: number;

  @ApiPropertyOptional({ type: Number, format: 'int32', example: 15, description: 'Sampling interval of the series' })
  timeIntervalMinutes?: number;

  @ApiPropertyOptional({ example: 'DPF-000001' })
  customerAccountId?: string;

  @ApiPropertyOptional({ example: '+2348031234567' })
  customerPhone?: string;

  @ApiPropertyOptional({ example: '18234', description: 'Unique ID of this position fix' })
  readingId?: string;

  @ApiPropertyOptional({ example: 'DARES-PUE-AGR-0042' })
  financingId?: string;

  @ApiPropertyOptional({ example: '9.203512' })
  latitude?: string;

  @ApiPropertyOptional({ example: '12.495410' })
  longitude?: string;

  @ApiPropertyOptional({ description: 'Not applicable — omitted.' })
  rate?: string;

  @ApiPropertyOptional({ description: 'Not applicable — omitted.' })
  rateCurrency?: string;

  @ApiPropertyOptional({ example: 'Musa Ibrahim' })
  customerName?: string;

  @ApiPropertyOptional({ example: 'IRRIGATION_FARMER' })
  customerCategory?: string;
}

@ApiSchema({ name: 'MeterResponse' })
export class OdysseyMeterResponse {
  @ApiProperty({ type: Number, format: 'int32', example: 0 })
  offset!: number;

  @ApiProperty({ type: Number, format: 'int32', example: 20 })
  pageLimit!: number;

  @ApiProperty({ type: Number, format: 'int32', example: 2 })
  total!: number;

  @ApiProperty({ type: [OdysseyMeter] })
  readings!: OdysseyMeter[];

  @ApiProperty({ type: [String], example: [] })
  errors!: string[];
}

@ApiSchema({ name: 'Payment' })
export class OdysseyPayment {
  @ApiProperty({ example: '2026-02-15T08:30:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: 450000 })
  amount!: number;

  @ApiProperty({ example: 'NGN' })
  currency!: string;

  @ApiProperty({ example: 'FULL_PAYMENT' })
  transactionType!: string;

  @ApiProperty({ example: 'DPUE-20260215-7KQ2M9XA' })
  transactionId!: string;

  @ApiPropertyOptional({ example: 'PUMP-SPX-000123' })
  serialNumber?: string;

  @ApiPropertyOptional({ example: 'PUMP-SPX-000123' })
  meterId?: string;

  @ApiPropertyOptional({ example: '+2348031234567' })
  customerPhone?: string;

  @ApiPropertyOptional({ example: 'Musa Ibrahim' })
  customerName?: string;

  @ApiPropertyOptional({ description: 'Staff member who recorded the payment' })
  agentId?: string;

  @ApiPropertyOptional({ example: 'DARES-PUE-AGR-0042' })
  financingId?: string;

  @ApiPropertyOptional({ example: '9.203512' })
  latitude?: string;

  @ApiPropertyOptional({ example: '12.495410' })
  longitude?: string;

  @ApiPropertyOptional({ example: 'DPF-000001' })
  customerAccountId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  customerId?: string;

  @ApiPropertyOptional({ example: 'IRRIGATION_FARMER' })
  customerCategory?: string;

  @ApiPropertyOptional({ type: Number, format: 'int32', description: 'Not applicable — omitted.' })
  failedBatteryCapacityCount?: number;
}

@ApiSchema({ name: 'PaymentResponse' })
export class OdysseyPaymentResponse {
  @ApiProperty({ type: [OdysseyPayment] })
  payments!: OdysseyPayment[];

  @ApiProperty({ type: String, example: '', description: 'Empty string when there are no errors (per Odyssey spec)' })
  errors!: string;
}

@ApiSchema({ name: 'TokenRenewalRequest' })
export class TokenRenewalRequest {
  @ApiProperty({ example: 'dpue_rt_…' })
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}

@ApiSchema({ name: 'TokenRenewalResponse' })
export class TokenRenewalResponse {
  @ApiProperty({ example: 'dpue_at_…' })
  accessToken!: string;

  @ApiProperty({ type: Number, format: 'int64', example: 86400, description: 'Seconds until the access token expires' })
  expiresIn!: number;
}
