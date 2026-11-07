import { Column, Entity, Generated, Index, OneToMany } from 'typeorm';
import { BaseEntity, numericTransformer } from '../common/entities/base.entity';
import type { Device } from '../devices/device.entity';

/** A farmer / client who receives a solar water pump. Maps to Odyssey "customer". */
@Entity('farmers')
export class Farmer extends BaseEntity {
  @Column({ type: 'int' })
  @Generated('increment')
  seq!: number;

  /** Customer account ID sent to Odyssey as customerAccountId, e.g. DPF-000012. */
  @Index({ unique: true })
  @Column({ name: 'account_number', length: 40 })
  accountNumber!: string;

  @Column({ name: 'full_name', length: 160 })
  fullName!: string;

  @Index()
  @Column({ length: 32 })
  phone!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  state!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  lga!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  community!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ name: 'farm_name', type: 'varchar', length: 160, nullable: true })
  farmName!: string | null;

  /** Intended installation point. Tracker pings are checked against this. */
  @Column({ name: 'farm_latitude', type: 'double precision', nullable: true })
  farmLatitude!: number | null;

  @Column({ name: 'farm_longitude', type: 'double precision', nullable: true })
  farmLongitude!: number | null;

  @Column({
    name: 'farm_size_hectares',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  farmSizeHectares!: number | null;

  @Column({ name: 'primary_crop', type: 'varchar', length: 80, nullable: true })
  primaryCrop!: string | null;

  /** Sent to Odyssey as customerCategory. */
  @Column({ length: 60, default: 'IRRIGATION_FARMER' })
  category!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @OneToMany('Device', 'farmer')
  devices?: Device[];
}
