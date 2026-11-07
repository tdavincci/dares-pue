import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity, numericTransformer } from '../common/entities/base.entity';
import { Farmer } from '../farmers/farmer.entity';

export enum DeviceStatus {
  /** In stock / registered, not yet deployed. */
  REGISTERED = 'REGISTERED',
  /** Installed on a farm and expected to report. */
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DECOMMISSIONED = 'DECOMMISSIONED',
}

/** A water pump with a GPS tracker attached. Maps to Odyssey "meter" (meterId = serialNumber). */
@Entity('devices')
export class Device extends BaseEntity {
  /** Pump serial number. Sent to Odyssey as meterId / serialNumber. */
  @Index({ unique: true })
  @Column({ name: 'serial_number', length: 80 })
  serialNumber!: string;

  /** 15-digit IMEI reported by the tracker (GT06 login packet / OsmAnd id). */
  @Index({ unique: true })
  @Column({ name: 'tracker_imei', length: 20 })
  trackerImei!: string;

  @Column({ name: 'tracker_model', length: 60, default: 'GT06' })
  trackerModel!: string;

  @Column({ name: 'tracker_sim_number', type: 'varchar', length: 32, nullable: true })
  trackerSimNumber!: string | null;

  @Column({ name: 'pump_model', type: 'varchar', length: 120, nullable: true })
  pumpModel!: string | null;

  @Column({ name: 'pump_capacity', type: 'varchar', length: 60, nullable: true })
  pumpCapacity!: string | null;

  /** Agreed full price of the pump. When set, a payment must match it exactly. */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: numericTransformer })
  price!: number | null;

  @Column({ length: 3, default: 'NGN' })
  currency!: string;

  /** Optional contract/agreement reference sent to Odyssey as financingId. */
  @Column({ name: 'financing_id', type: 'varchar', length: 80, nullable: true })
  financingId!: string | null;

  @Index()
  @Column({ type: 'enum', enum: DeviceStatus, enumName: 'device_status', default: DeviceStatus.REGISTERED })
  status!: DeviceStatus;

  @ManyToOne(() => Farmer, (f) => f.devices, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'farmer_id' })
  farmer!: Farmer | null;

  @Index()
  @Column({ name: 'farmer_id', type: 'uuid', nullable: true })
  farmerId!: string | null;

  @Column({ name: 'geofence_radius_m', type: 'int', default: 500 })
  geofenceRadiusMeters!: number;

  /** Expected reporting interval, sent as timeIntervalMinutes when readings are not down-sampled. */
  @Column({ name: 'report_interval_minutes', type: 'int', default: 1 })
  reportIntervalMinutes!: number;

  @Column({ name: 'installed_at', type: 'timestamptz', nullable: true })
  installedAt!: Date | null;

  /** SHA-256 of the HTTP ingest key (only used by HTTP/OsmAnd trackers). */
  @Column({ name: 'ingest_key_hash', type: 'varchar', length: 64, nullable: true, select: false })
  ingestKeyHash!: string | null;

  // ---- denormalised "last known" state, updated on every ping ----
  @Column({ name: 'last_latitude', type: 'double precision', nullable: true })
  lastLatitude!: number | null;

  @Column({ name: 'last_longitude', type: 'double precision', nullable: true })
  lastLongitude!: number | null;

  @Index()
  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @Column({ name: 'last_fix_at', type: 'timestamptz', nullable: true })
  lastFixAt!: Date | null;

  @Column({ name: 'last_speed_kph', type: 'real', nullable: true })
  lastSpeedKph!: number | null;

  @Column({ name: 'last_battery_level', type: 'smallint', nullable: true })
  lastBatteryLevel!: number | null;

  @Column({ name: 'last_distance_from_farm_m', type: 'double precision', nullable: true })
  lastDistanceFromFarmMeters!: number | null;

  @Column({ name: 'last_within_geofence', type: 'boolean', nullable: true })
  lastWithinGeofence!: boolean | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
