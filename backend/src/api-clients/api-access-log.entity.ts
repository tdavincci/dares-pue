import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ApiClient } from './api-client.entity';

/** One request made to the Odyssey Standard API (data endpoints and token renewal), successful or not. */
@Entity('api_access_logs')
@Index('IDX_api_access_logs_created_at', ['createdAt'])
@Index('IDX_api_access_logs_client_created', ['clientId', 'createdAt'])
export class ApiAccessLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** Null when the caller could not be identified (missing/invalid token or refresh token). */
  @ManyToOne(() => ApiClient, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'client_id' })
  client!: ApiClient | null;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId!: string | null;

  /** Display prefix of the access token used (never the token itself). */
  @Column({ name: 'token_prefix', type: 'varchar', length: 16, nullable: true })
  tokenPrefix!: string | null;

  @Column({ length: 8 })
  method!: string;

  /** readings | payments | token-renewal */
  @Column({ length: 40 })
  endpoint!: string;

  /** Request path including the query string. */
  @Column({ length: 1000 })
  url!: string;

  @Column({ name: 'status_code', type: 'int' })
  statusCode!: number;

  @Column()
  success!: boolean;

  /** Records returned in this response (readings or payments). */
  @Column({ name: 'record_count', type: 'int', nullable: true })
  recordCount!: number | null;

  /** Total records matching the query (before paging). */
  @Column({ type: 'int', nullable: true })
  total!: number | null;

  /** One-line result, e.g. "48 readings (of 120)" or "Access token issued, expires in 86400 s". */
  @Column({ length: 300 })
  summary!: string;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ name: 'duration_ms', type: 'int' })
  durationMs!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 300, nullable: true })
  userAgent!: string | null;
}
