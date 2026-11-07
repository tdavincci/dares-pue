import {
  All,
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Ip,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHeader, ApiOperation, ApiProperty, ApiPropertyOptional, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { LocationSource } from '../locations/location-ping.entity';
import { LocationsService, RecordResult } from '../locations/locations.service';

class LocationPointDto {
  @ApiProperty({ example: 9.203512 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 12.49541 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ format: 'date-time', description: 'GPS fix time; defaults to receive time' })
  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  speedKph?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() course?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() altitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) satellites?: number;

  @ApiPropertyOptional({ example: 87 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() gpsValid?: boolean;
}

class LocationBatchDto {
  @ApiProperty({ type: [LocationPointDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LocationPointDto)
  points!: LocationPointDto[];
}

function summarize(results: RecordResult[]) {
  return {
    received: results.length,
    stored: results.filter((r) => r.stored).length,
    rejected: results.filter((r) => !r.stored).map((r) => (r.stored ? null : r.reason)),
  };
}

/**
 * HTTP ingest for trackers or gateways that can POST over HTTP(S).
 * GT06 binary trackers do NOT use these routes — they connect to the TCP listener.
 */
@ApiTags('Tracker Ingest')
@SkipThrottle()
@Controller('ingest')
export class IngestController {
  constructor(
    private readonly locations: LocationsService,
    private readonly config: ConfigService,
  ) {}

  private async deviceForKey(key?: string) {
    if (!key) throw new UnauthorizedException('Missing X-Device-Key header');
    const device = await this.locations.findDeviceByIngestKey(key);
    if (!device) throw new UnauthorizedException('Invalid device key');
    return device;
  }

  private toFix(p: LocationPointDto) {
    return {
      recordedAt: p.timestamp ? new Date(p.timestamp) : new Date(),
      latitude: p.latitude,
      longitude: p.longitude,
      speedKph: p.speedKph,
      course: p.course,
      altitude: p.altitude,
      satellites: p.satellites,
      batteryLevel: p.batteryLevel,
      gpsValid: p.gpsValid,
    };
  }

  @Post('locations')
  @HttpCode(202)
  @ApiOperation({ summary: 'Push a single position (JSON). Authenticated with the device ingest key.' })
  @ApiHeader({
    name: 'X-Device-Key',
    required: true,
    description: 'Ingest key returned when the device was registered',
  })
  async single(@Headers('x-device-key') key: string, @Body() body: LocationPointDto) {
    const device = await this.deviceForKey(key);
    return summarize([await this.locations.record(device, this.toFix(body), LocationSource.HTTP)]);
  }

  @Post('locations/batch')
  @HttpCode(202)
  @ApiOperation({ summary: 'Push buffered positions (up to 500) in one call' })
  @ApiHeader({ name: 'X-Device-Key', required: true })
  async batch(@Headers('x-device-key') key: string, @Body() body: LocationBatchDto) {
    const device = await this.deviceForKey(key);
    const sorted = [...body.points].sort((a, b) => +new Date(a.timestamp ?? 0) - +new Date(b.timestamp ?? 0));
    const results: RecordResult[] = [];
    for (const p of sorted) results.push(await this.locations.record(device, this.toFix(p), LocationSource.HTTP));
    return summarize(results);
  }

  /**
   * OsmAnd / Traccar Client protocol: `?id=<IMEI>&lat=..&lon=..&timestamp=..&speed=<knots>&batt=..&key=..`
   * Also lets a Traccar server forward positions to us.
   */
  @All('osmand')
  @HttpCode(200)
  @ApiOperation({ summary: 'OsmAnd/Traccar-compatible ingest (GET or POST with query params)' })
  @ApiQuery({ name: 'id', required: true, description: 'Tracker IMEI' })
  @ApiQuery({ name: 'lat', required: true })
  @ApiQuery({ name: 'lon', required: true })
  @ApiQuery({ name: 'timestamp', required: false, description: 'Unix seconds/ms or ISO 8601' })
  @ApiQuery({ name: 'speed', required: false, description: 'knots' })
  @ApiQuery({ name: 'bearing', required: false })
  @ApiQuery({ name: 'altitude', required: false })
  @ApiQuery({ name: 'batt', required: false, description: 'battery %' })
  @ApiQuery({
    name: 'key',
    required: false,
    description: 'Device ingest key (required unless OSMAND_REQUIRE_KEY=false)',
  })
  async osmand(@Query() q: Record<string, string>, @Ip() ip: string) {
    const imei = (q.id ?? q.deviceid ?? '').trim();
    const lat = Number(q.lat);
    const lon = Number(q.lon);
    if (!imei || !Number.isFinite(lat) || !Number.isFinite(lon))
      throw new BadRequestException('id, lat and lon are required');

    const device = await this.locations.findDeviceByImei(imei);
    if (!device) {
      this.locations.noteUnknown(imei, LocationSource.OSMAND, ip);
      throw new UnauthorizedException('Unknown device');
    }
    if (
      this.config.get<boolean>('tracking.osmandRequireKey') &&
      !(await this.locations.verifyIngestKey(device.id, q.key))
    ) {
      throw new UnauthorizedException('Invalid device key');
    }

    let recordedAt = new Date();
    if (q.timestamp) {
      const n = Number(q.timestamp);
      recordedAt = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(q.timestamp);
      if (isNaN(+recordedAt)) throw new BadRequestException('Invalid timestamp');
    }
    const num = (v?: string) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
    const speedKnots = num(q.speed);
    const res = await this.locations.record(
      device,
      {
        recordedAt,
        latitude: lat,
        longitude: lon,
        speedKph: speedKnots !== undefined ? Math.round(speedKnots * 1.852 * 10) / 10 : undefined,
        course: num(q.bearing ?? q.heading),
        altitude: num(q.altitude),
        batteryLevel: num(q.batt) !== undefined ? Math.round(num(q.batt)!) : undefined,
        gpsValid: q.valid === undefined ? true : q.valid !== 'false' && q.valid !== '0',
      },
      LocationSource.OSMAND,
    );
    return summarize([res]);
  }
}
