import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

export enum UserRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER',
}

@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 160 })
  email!: string;

  @Column({ name: 'full_name', length: 160 })
  fullName!: string;

  @Column({ name: 'password_hash', select: false })
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role', default: UserRole.OPERATOR })
  role!: UserRole;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;
}
