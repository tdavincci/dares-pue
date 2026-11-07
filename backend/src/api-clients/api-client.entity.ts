import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';

/** A third-party integrator (e.g. Odyssey) allowed to read the Standard API. */
@Entity('api_clients')
export class ApiClient extends BaseEntity {
  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  /** SHA-256 of the long-lived refresh token used at /token-renewal. */
  @Index({ unique: true, where: 'refresh_token_hash IS NOT NULL' })
  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 64, nullable: true, select: false })
  refreshTokenHash!: string | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @OneToMany(() => ApiAccessToken, (t) => t.client)
  tokens?: ApiAccessToken[];
}

export enum TokenKind {
  /** Issued by an admin; optional expiry. */
  STATIC = 'STATIC',
  /** Issued by the token-renewal endpoint. */
  RENEWED = 'RENEWED',
}

@Entity('api_access_tokens')
export class ApiAccessToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ApiClient, (c) => c.tokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client!: ApiClient;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', length: 64, select: false })
  tokenHash!: string;

  /** First characters of the token, for display only. */
  @Column({ name: 'token_prefix', length: 16 })
  tokenPrefix!: string;

  @Column({ type: 'enum', enum: TokenKind, enumName: 'token_kind' })
  kind!: TokenKind;

  @Column({ type: 'varchar', length: 120, nullable: true })
  label!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
