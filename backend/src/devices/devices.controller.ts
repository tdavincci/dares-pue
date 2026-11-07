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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LocationsService } from '../locations/locations.service';
import { UserRole } from '../users/user.entity';
import { CreateDeviceDto, DeviceQueryDto, LocationHistoryQueryDto, UpdateDeviceDto } from './devices.dto';
import { DevicesService } from './devices.service';

@ApiTags('Admin · Devices')
@ApiBearerAuth('admin-jwt')
@UseGuards(JwtAuthGuard)
@Controller('admin/devices')
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly locations: LocationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List devices with last known position, online and geofence state' })
  list(@Query() q: DeviceQueryDto) {
    return this.devices.list(q);
  }

  @Get('map')
  @ApiOperation({ summary: 'Last known position of every deployed device (for the map view)' })
  map() {
    return this.devices.mapData();
  }

  @Get('unregistered')
  @ApiOperation({ summary: 'Trackers that connected but are not registered (since last restart)' })
  unregistered() {
    return this.locations.listUnknown();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.findOne(id);
  }

  @Get(':id/locations')
  @ApiOperation({ summary: 'Location history (track) of a device' })
  history(@Param('id', ParseUUIDPipe) id: string, @Query() q: LocationHistoryQueryDto) {
    return this.devices.history(id, q);
  }

  @Post()
  @Roles(UserRole.OPERATOR)
  @ApiOperation({ summary: 'Register a pump + tracker. Returns the HTTP ingest key ONCE.' })
  async create(@Body() dto: CreateDeviceDto) {
    const res = await this.devices.create(dto);
    this.locations.forgetUnknown(dto.trackerImei);
    return res;
  }

  @Patch(':id')
  @Roles(UserRole.OPERATOR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDeviceDto) {
    return this.devices.update(id, dto);
  }

  @Post(':id/rotate-ingest-key')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Issue a new HTTP ingest key (old key stops working)' })
  rotate(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.rotateIngestKey(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.remove(id);
  }
}
