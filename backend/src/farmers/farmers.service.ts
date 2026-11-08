import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Paged, PageQueryDto } from '../common/dto/pagination.dto';
import { LiveEventsService } from '../live/live-events.service';
import { Farmer } from './farmer.entity';
import { CreateFarmerDto, UpdateFarmerDto } from './farmers.dto';

@Injectable()
export class FarmersService {
  constructor(
    @InjectRepository(Farmer) private readonly repo: Repository<Farmer>,
    private readonly live: LiveEventsService,
  ) {}

  async list(q: PageQueryDto): Promise<Paged<Farmer>> {
    const qb = this.repo
      .createQueryBuilder('f')
      .orderBy('f.createdAt', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    if (q.search) {
      const s = `%${q.search.trim()}%`;
      qb.where(
        new Brackets((w) =>
          w
            .where('f.fullName ILIKE :s', { s })
            .orWhere('f.phone ILIKE :s', { s })
            .orWhere('f.accountNumber ILIKE :s', { s })
            .orWhere('f.community ILIKE :s', { s })
            .orWhere('f.farmName ILIKE :s', { s }),
        ),
      );
    }
    const [farmers, total] = await qb.getManyAndCount();
    const counts: { farmer_id: string; n: number }[] = farmers.length
      ? await this.repo.query(
          `SELECT farmer_id, count(*)::int AS n FROM devices WHERE farmer_id = ANY($1) GROUP BY farmer_id`,
          [farmers.map((f) => f.id)],
        )
      : [];
    const byId = new Map(counts.map((c) => [c.farmer_id, c.n]));
    const items = farmers.map((f) => Object.assign(f, { deviceCount: byId.get(f.id) ?? 0 }));
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async findOne(id: string) {
    const f = await this.repo.findOne({ where: { id }, relations: { devices: true } });
    if (!f) throw new NotFoundException('Farmer not found');
    return f;
  }

  async create(dto: CreateFarmerDto) {
    this.assertCoordsPaired(dto);
    if (dto.accountNumber && (await this.repo.exists({ where: { accountNumber: dto.accountNumber } }))) {
      throw new ConflictException('Account number already exists');
    }
    const created = await this.repo.manager.transaction(async (em) => {
      const farmer = em.create(Farmer, {
        ...dto,
        accountNumber: dto.accountNumber ?? `TMP-${Date.now()}-${Math.random()}`,
      });
      const saved = await em.save(farmer);
      if (!dto.accountNumber) {
        saved.accountNumber = `DPF-${String(saved.seq).padStart(6, '0')}`;
        await em.update(Farmer, saved.id, { accountNumber: saved.accountNumber });
      }
      return saved;
    });
    this.live.farmerChanged(created.id, 'created');
    return created;
  }

  async update(id: string, dto: UpdateFarmerDto) {
    const farmer = await this.findOne(id);
    if (dto.accountNumber && dto.accountNumber !== farmer.accountNumber) {
      if (await this.repo.exists({ where: { accountNumber: dto.accountNumber } })) {
        throw new ConflictException('Account number already exists');
      }
    }
    const merged = { ...farmer, ...dto };
    this.assertCoordsPaired(merged);
    delete (merged as Partial<Farmer>).devices;
    await this.repo.save(merged);
    this.live.farmerChanged(id, 'updated');
    return this.findOne(id);
  }

  async remove(id: string) {
    const farmer = await this.findOne(id);
    if (farmer.devices?.length) throw new BadRequestException("Unassign the farmer's devices before deleting");
    try {
      await this.repo.delete(id);
    } catch {
      throw new BadRequestException('Farmer has payment records and cannot be deleted');
    }
    this.live.farmerChanged(id, 'deleted');
  }

  private assertCoordsPaired(d: { farmLatitude?: number | null; farmLongitude?: number | null }) {
    const hasLat = d.farmLatitude !== undefined && d.farmLatitude !== null;
    const hasLng = d.farmLongitude !== undefined && d.farmLongitude !== null;
    if (hasLat !== hasLng) throw new BadRequestException('farmLatitude and farmLongitude must be provided together');
  }
}
