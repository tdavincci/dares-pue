import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { Paged } from '../common/dto/pagination.dto';
import { randomCode } from '../common/utils/crypto';
import { Device } from '../devices/device.entity';
import { Payment, PaymentStatus, PaymentType } from './payment.entity';
import { CreatePaymentDto, PaymentQueryDto } from './payments.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly repo: Repository<Payment>,
    private readonly ds: DataSource,
    private readonly config: ConfigService,
  ) {}

  async list(q: PaymentQueryDto): Promise<Paged<Payment>> {
    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.farmer', 'f')
      .leftJoinAndSelect('p.device', 'd')
      .leftJoinAndSelect('p.recordedBy', 'u')
      .orderBy('p.paidAt', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    if (q.status) qb.andWhere('p.status = :st', { st: q.status });
    if (q.farmerId) qb.andWhere('p.farmerId = :fid', { fid: q.farmerId });
    if (q.deviceId) qb.andWhere('p.deviceId = :did', { did: q.deviceId });
    if (q.from) qb.andWhere('p.paidAt >= :from', { from: new Date(q.from) });
    if (q.to) qb.andWhere('p.paidAt <= :to', { to: new Date(q.to) });
    if (q.search) {
      const s = `%${q.search.trim()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('p.transactionId ILIKE :s', { s })
            .orWhere('p.reference ILIKE :s', { s })
            .orWhere('f.fullName ILIKE :s', { s })
            .orWhere('d.serialNumber ILIKE :s', { s }),
        ),
      );
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async findOne(id: string) {
    const p = await this.repo.findOne({ where: { id }, relations: { farmer: true, device: true, recordedBy: true } });
    if (!p) throw new NotFoundException('Payment not found');
    return p;
  }

  /**
   * Records a payment. Current policy: full payment only — one completed payment per pump,
   * and if the pump has a price the amount must match it exactly.
   */
  async create(dto: CreatePaymentDto, userId: string) {
    const type = dto.paymentType ?? PaymentType.FULL_PAYMENT;
    if (type === PaymentType.INSTALLMENT && !this.config.get<boolean>('payments.allowInstallments')) {
      throw new BadRequestException('Installment payments are not enabled. Only full payment is accepted.');
    }

    const id = await this.ds.transaction(async (em) => {
      // Lock the device row so two operators can't record a full payment at the same time.
      const device = await em
        .getRepository(Device)
        .createQueryBuilder('d')
        .setLock('pessimistic_write')
        .where('d.id = :id', { id: dto.deviceId })
        .getOne();
      if (!device) throw new BadRequestException('Device not found');
      if (!device.farmerId) throw new BadRequestException('Assign the device to a farmer before recording payment');

      const currency = dto.currency ?? device.currency ?? this.config.get<string>('payments.defaultCurrency')!;
      if (device.currency && currency !== device.currency) {
        throw new BadRequestException(`Currency must be ${device.currency} for this device`);
      }

      if (type === PaymentType.FULL_PAYMENT) {
        const existing = await em.getRepository(Payment).findOne({
          where: { deviceId: device.id, status: PaymentStatus.COMPLETED },
        });
        if (existing) throw new ConflictException(`Device already fully paid (transaction ${existing.transactionId})`);
        if (device.price !== null && Math.abs(device.price - dto.amount) > 0.001) {
          throw new BadRequestException(
            `Full payment must equal the device price of ${device.price.toFixed(2)} ${device.currency}`,
          );
        }
      }

      const payment = em.getRepository(Payment).create({
        transactionId: this.newTransactionId(),
        deviceId: device.id,
        farmerId: device.farmerId,
        amount: dto.amount,
        currency,
        paymentType: type,
        method: dto.method,
        reference: dto.reference ?? null,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        status: PaymentStatus.COMPLETED,
        recordedById: userId,
        notes: dto.notes ?? null,
      });
      if (payment.paidAt.getTime() > Date.now() + 5 * 60_000)
        throw new BadRequestException('paidAt cannot be in the future');
      return (await em.getRepository(Payment).save(payment)).id;
    });
    return this.findOne(id);
  }

  async reverse(id: string, reason: string) {
    const p = await this.findOne(id);
    if (p.status === PaymentStatus.REVERSED) throw new BadRequestException('Payment already reversed');
    await this.repo.update(id, { status: PaymentStatus.REVERSED, reversalReason: reason, reversedAt: new Date() });
    return this.findOne(id);
  }

  private newTransactionId() {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `DPUE-${d}-${randomCode(8)}`;
  }
}
