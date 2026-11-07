import { ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { User, UserRole } from './user.entity';

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  /** Seed the first administrator so a fresh install can log in. */
  async onApplicationBootstrap() {
    if ((await this.repo.count()) > 0) return;
    const email = this.config.get<string>('auth.seedAdminEmail')!;
    await this.create({
      email,
      fullName: this.config.get<string>('auth.seedAdminName')!,
      password: this.config.get<string>('auth.seedAdminPassword')!,
      role: UserRole.ADMIN,
    });
    this.logger.warn(`Seeded initial admin user ${email} — change the password after first login.`);
  }

  findAll() {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  async findById(id: string) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  findByEmailWithPassword(email: string) {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('lower(u.email) = lower(:email)', { email })
      .getOne();
  }

  async findByIdWithPassword(id: string) {
    return this.repo.createQueryBuilder('u').addSelect('u.passwordHash').where('u.id = :id', { id }).getOne();
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.repo.exists({ where: { email } })) throw new ConflictException('Email already in use');
    const user = this.repo.create({
      email,
      fullName: dto.fullName,
      role: dto.role ?? UserRole.OPERATOR,
      passwordHash: await bcrypt.hash(dto.password, 12),
    });
    const saved = await this.repo.save(user);
    return this.findById(saved.id);
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.findById(id);
    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    await this.repo.save(user);
    if (dto.password) await this.setPassword(id, dto.password);
    return this.findById(id);
  }

  async setPassword(id: string, password: string) {
    await this.repo.update(id, { passwordHash: await bcrypt.hash(password, 12) });
  }

  async touchLogin(id: string) {
    await this.repo.update(id, { lastLoginAt: new Date() });
  }
}
