import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Brackets, Repository } from 'typeorm';
import { Paged } from '../common/dto/pagination.dto';
import { generateSecret, sha256 } from '../common/utils/crypto';
import { Farmer } from '../farmers/farmer.entity';
import { LocationPing } from '../locations/location-ping.entity';
import { Device, DeviceStatus } from './device.entity';
import { CreateDeviceDto, DeviceQueryDto, LocationHistoryQueryDto, UpdateDeviceDto } from './devices.dto';

export interface DeviceView extends Device {
  online: boolean;
}

@Injectable()
export class DevicesService {
  private readonly onlineMinutes: number;
  private readonly defaultRadius: number;

  constructor(
    @InjectRepository(Device) private readonly repo: Repository<Device>,
    @InjectRepository(Farmer) private readonly farmers: Repository<Farmer>,
    @InjectRepository(LocationPing) private readonly pings: Repository<LocationPing>,
    config: ConfigService,
  ) {
    this.onlineMinutes = config.get<number>('tracking.onlineThresholdMinutes')!;
    this.defaultRadius = config.get<number>('tracking.defaultGeofenceRadiusMeters')!;
  }

  private onlineCutoff() {
    return new Date(Date.now() - this.onlineMinutes * 60_000);
  }

  view(d: Device): DeviceView {
    return Object.assign(d, { online: !!d.lastSeenAt && d.lastSeenAt >= this.onlineCutoff() });
  }

  async list(q: DeviceQueryDto): Promise<Paged<DeviceView>> {
    const qb = this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.farmer', 'f')
      .orderBy('d.lastSeenAt', 'DESC', 'NULLS LAST')
      .addOrderBy('d.createdAt', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    if (q.status) qb.andWhere('d.status = :status', { status: q.status });
    if (q.farmerId) qb.andWhere('d.farmerId = :fid', { fid: q.farmerId });
    if (q.online === true) qb.andWhere('d.lastSeenAt >= :cut', { cut: this.onlineCutoff() });
    if (q.online === false) qb.andWhere('(d.lastSeenAt IS NULL OR d.lastSeenAt < :cut)', { cut: this.onlineCutoff() });
    if (q.withinGeofence !== undefined) qb.andWhere('d.lastWithinGeofence = :wg', { wg: q.withinGeofence });
    if (q.search) {
      const s = `%${q.search.trim()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('d.serialNumber ILIKE :s', { s })
            .orWhere('d.trackerImei ILIKE :s', { s })
            .orWhere('f.fullName ILIKE :s', { s })
            .orWhere('f.accountNumber ILIKE :s', { s }),
        ),
      );
    }
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map((d) => this.view(d)), total, page: q.page, pageSize: q.pageSize };
  }

  /** Every non-decommissioned device that has reported at least once — for the map. */
  async mapData() {
    const devices = await this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.farmer', 'f')
      .where('d.lastLatitude IS NOT NULL')
      .andWhere('d.status <> :dec', { dec: DeviceStatus.DECOMMISSIONED })
      .getMany();
    return devices.map((d) => {
      const v = this.view(d);
      return {
        id: v.id,
        serialNumber: v.serialNumber,
        trackerImei: v.trackerImei,
        status: v.status,
        latitude: v.lastLatitude,
        longitude: v.lastLongitude,
        lastSeenAt: v.lastSeenAt,
        batteryLevel: v.lastBatteryLevel,
        speedKph: v.lastSpeedKph,
        online: v.online,
        withinGeofence: v.lastWithinGeofence,
        distanceFromFarmMeters: v.lastDistanceFromFarmMeters,
        geofenceRadiusMeters: v.geofenceRadiusMeters,
        farmer: v.farmer
          ? {
              id: v.farmer.id,
              fullName: v.farmer.fullName,
              accountNumber: v.farmer.accountNumber,
              phone: v.farmer.phone,
              farmLatitude: v.farmer.farmLatitude,
              farmLongitude: v.farmer.farmLongitude,
            }
          : null,
      };
    });
  }

  async findOne(id: string): Promise<DeviceView> {
    const d = await this.repo.findOne({ where: { id }, relations: { farmer: true } });
    if (!d) throw new NotFoundException('Device not found');
    return this.view(d);
  }

  async create(dto: CreateDeviceDto) {
    await this.assertUnique(dto.serialNumber, dto.trackerImei);
    if (dto.farmerId) await this.assertFarmer(dto.farmerId);
    const ingestKey = generateSecret('dpue_dk', 16);
    const device = this.repo.create({
      ...dto,
      installedAt: dto.installedAt ? new Date(dto.installedAt) : null,
      geofenceRadiusMeters: dto.geofenceRadiusMeters ?? this.defaultRadius,
      ingestKeyHash: sha256(ingestKey),
    });
    const saved = await this.repo.save(device);
    // Returned once only: used by HTTP/OsmAnd trackers. GT06 trackers authenticate by IMEI.
    return { device: await this.findOne(saved.id), ingestKey };
  }

  async update(id: string, dto: UpdateDeviceDto) {
    const device = await this.findOne(id);
    if (dto.serialNumber && dto.serialNumber !== device.serialNumber) await this.assertUnique(dto.serialNumber);
    if (dto.trackerImei && dto.trackerImei !== device.trackerImei) await this.assertUnique(undefined, dto.trackerImei);
    if (dto.farmerId) await this.assertFarmer(dto.farmerId);

    const { installedAt, ...rest } = dto;
    const patch: Partial<Device> = { ...rest };
    if (installedAt !== undefined) patch.installedAt = installedAt ? new Date(installedAt) : null;
    const farmerOrRadiusChanged =
      (dto.farmerId !== undefined && dto.farmerId !== device.farmerId) ||
      (dto.geofenceRadiusMeters !== undefined && dto.geofenceRadiusMeters !== device.geofenceRadiusMeters);
    if (farmerOrRadiusChanged) {
      // Geofence verdict must be recomputed on the next ping.
      patch.lastWithinGeofence = null;
      patch.lastDistanceFromFarmMeters = null;
    }
    await this.repo.update(id, patch);
    return this.findOne(id);
  }

  async rotateIngestKey(id: string) {
    await this.findOne(id);
    const ingestKey = generateSecret('dpue_dk', 16);
    await this.repo.update(id, { ingestKeyHash: sha256(ingestKey) });
    return { ingestKey };
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      await this.repo.delete(id);
    } catch {
      throw new BadRequestException('Device has payment records; set status to DECOMMISSIONED instead');
    }
  }

  async history(id: string, q: LocationHistoryQueryDto) {
    await this.findOne(id);
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 24 * 3600_000);
    if (from > to) throw new BadRequestException('from must be before to');
    const points = await this.pings.find({
      where: { deviceId: id, recordedAt: Between(from, to) },
      order: { recordedAt: 'ASC' },
      take: q.limit,
    });
    return { from, to, count: points.length, points };
  }

  private async assertUnique(serialNumber?: string, imei?: string) {
    if (serialNumber && (await this.repo.exists({ where: { serialNumber } })))
      throw new ConflictException('A device with this serial number already exists');
    if (imei && (await this.repo.exists({ where: { trackerImei: imei } })))
      throw new ConflictException('A device with this tracker IMEI already exists');
  }

  private async assertFarmer(id: string) {
    if (!(await this.farmers.exists({ where: { id } }))) throw new BadRequestException('farmerId does not exist');
  }
}
