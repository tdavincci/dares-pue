import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity, numericTransformer } from '../common/entities/base.entity';
import { Device } from '../devices/device.entity';
import { Farmer } from '../farmers/farmer.entity';
import { User } from '../users/user.entity';

export enum PaymentType {
  FULL_PAYMENT = 'FULL_PAYMENT',
  /** Reserved for a future phase — rejected while PAYMENTS_ALLOW_INSTALLMENTS=false. */
  INSTALLMENT = 'INSTALLMENT',
}

export enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  POS = 'POS',
  MOBILE_MONEY = 'MOBILE_MONEY',
  CHEQUE = 'CHEQUE',
  OTHER = 'OTHER',
}

export enum PaymentStatus {
  COMPLETED = 'COMPLETED',
  REVERSED = 'REVERSED',
}

@Entity('payments')
@Index('uq_payment_one_full_per_device', ['deviceId'], {
  unique: true,
  where: `"status" = 'COMPLETED' AND "payment_type" = 'FULL_PAYMENT'`,
})
export class Payment extends BaseEntity {
  /** Our transaction ID, sent to Odyssey as transactionId. */
  @Index({ unique: true })
  @Column({ name: 'transaction_id', length: 40 })
  transactionId!: string;

  @ManyToOne(() => Farmer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farmer_id' })
  farmer!: Farmer;

  @Index()
  @Column({ name: 'farmer_id', type: 'uuid' })
  farmerId!: string;

  @ManyToOne(() => Device, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'device_id' })
  device!: Device;

  @Index()
  @Column({ name: 'device_id', type: 'uuid' })
  deviceId!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: numericTransformer })
  amount!: number;

  @Column({ length: 3, default: 'NGN' })
  currency!: string;

  @Column({ name: 'payment_type', type: 'enum', enum: PaymentType, enumName: 'payment_type' })
  paymentType!: PaymentType;

  @Column({ type: 'enum', enum: PaymentMethod, enumName: 'payment_method' })
  method!: PaymentMethod;

  /** External reference: bank teller / transfer session ID / POS RRN. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  reference!: string | null;

  @Index()
  @Column({ name: 'paid_at', type: 'timestamptz' })
  paidAt!: Date;

  @Column({ type: 'enum', enum: PaymentStatus, enumName: 'payment_status', default: PaymentStatus.COMPLETED })
  status!: PaymentStatus;

  @Column({ name: 'reversal_reason', type: 'text', nullable: true })
  reversalReason!: string | null;

  @Column({ name: 'reversed_at', type: 'timestamptz', nullable: true })
  reversedAt!: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'recorded_by_id' })
  recordedBy!: User | null;

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
