import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Device } from '../devices/device.entity';

export enum LocationSource {
  GT06 = 'GT06',
  HTTP = 'HTTP',
  OSMAND = 'OSMAND',
}

@Entity('location_pings')
@Index('uq_location_device_time', ['deviceId', 'recordedAt'], { unique: true })
@Index('ix_location_recorded_at', ['recordedAt'])
export class LocationPing {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device?: Device;

  @Column({ name: 'device_id', type: 'uuid' })
  deviceId!: string;

  /** GPS fix time reported by the device (UTC). */
  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt!: Date;

  @Column({ name: 'received_at', type: 'timestamptz', default: () => 'now()' })
  receivedAt!: Date;

  @Column({ type: 'double precision' })
  latitude!: number;

  @Column({ type: 'double precision' })
  longitude!: number;

  @Column({ name: 'speed_kph', type: 'real', nullable: true })
  speedKph!: number | null;

  @Column({ type: 'real', nullable: true })
  course!: number | null;

  @Column({ type: 'real', nullable: true })
  altitude!: number | null;

  @Column({ type: 'smallint', nullable: true })
  satellites!: number | null;

  @Column({ name: 'gps_valid', default: true })
  gpsValid!: boolean;

  @Column({ name: 'battery_level', type: 'smallint', nullable: true })
  batteryLevel!: number | null;

  @Column({ type: 'enum', enum: LocationSource, enumName: 'location_source' })
  source!: LocationSource;

  @Column({ name: 'distance_from_farm_m', type: 'double precision', nullable: true })
  distanceFromFarmMeters!: number | null;

  @Column({ name: 'within_geofence', type: 'boolean', nullable: true })
  withinGeofence!: boolean | null;
}
