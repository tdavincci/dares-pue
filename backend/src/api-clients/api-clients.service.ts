import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { generateSecret, sha256 } from '../common/utils/crypto';
import { ApiAccessToken, ApiClient, TokenKind } from './api-client.entity';

export interface ValidatedClient {
  clientId: string;
  clientName: string;
  tokenId: string;
}

@Injectable()
export class ApiClientsService {
  constructor(
    @InjectRepository(ApiClient) private readonly clients: Repository<ApiClient>,
    @InjectRepository(ApiAccessToken) private readonly tokens: Repository<ApiAccessToken>,
    private readonly config: ConfigService,
  ) {}

  list() {
    return this.clients.find({ order: { createdAt: 'ASC' }, relations: { tokens: true } }).then((cs) =>
      cs.map((c) => ({
        ...c,
        tokens: (c.tokens ?? [])
          .filter((t) => !t.revokedAt && (!t.expiresAt || t.expiresAt > new Date()))
          .sort((a, b) => +b.createdAt - +a.createdAt),
      })),
    );
  }

  async get(id: string) {
    const c = await this.clients.findOne({ where: { id } });
    if (!c) throw new NotFoundException('API client not found');
    return c;
  }

  async create(name: string, description?: string) {
    return this.clients.save(this.clients.create({ name, description: description ?? null }));
  }

  async update(id: string, patch: { name?: string; description?: string; isActive?: boolean }) {
    await this.get(id);
    await this.clients.update(id, patch);
    return this.get(id);
  }

  /** Long-lived access token issued by an admin (what you paste into Odyssey's integration form). */
  async issueStaticToken(clientId: string, label?: string, expiresInDays?: number) {
    await this.get(clientId);
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400_000) : null;
    return this.issue(clientId, TokenKind.STATIC, expiresAt, label ?? null);
  }

  /** Refresh token for Odyssey's token-renewal flow. Replaces any previous refresh token. */
  async issueRefreshToken(clientId: string) {
    await this.get(clientId);
    const refreshToken = generateSecret('dpue_rt', 32);
    await this.clients.update(clientId, { refreshTokenHash: sha256(refreshToken) });
    return { refreshToken };
  }

  async revokeRefreshToken(clientId: string) {
    await this.clients.update(clientId, { refreshTokenHash: null });
  }

  async revokeToken(clientId: string, tokenId: string) {
    const res = await this.tokens.update({ id: tokenId, clientId, revokedAt: IsNull() }, { revokedAt: new Date() });
    if (!res.affected) throw new NotFoundException('Token not found or already revoked');
  }

  /** Exchange a refresh token for a short-lived access token. Returns null if the refresh token is invalid. */
  async renew(refreshToken: string) {
    const client = await this.clients
      .createQueryBuilder('c')
      .where('c.refreshTokenHash = :h', { h: sha256(refreshToken) })
      .getOne();
    if (!client || !client.isActive) return null;
    const ttl = this.config.get<number>('odyssey.accessTokenTtlSeconds')!;
    const { token } = await this.issue(
      client.id,
      TokenKind.RENEWED,
      new Date(Date.now() + ttl * 1000),
      'token-renewal',
    );
    // Housekeeping: drop expired renewed tokens for this client.
    await this.tokens
      .createQueryBuilder()
      .delete()
      .where('client_id = :cid AND kind = :k AND expires_at < now()', { cid: client.id, k: TokenKind.RENEWED })
      .execute();
    return { accessToken: token, expiresIn: ttl };
  }

  async validate(rawToken: string): Promise<ValidatedClient | null> {
    const t = await this.tokens
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.client', 'c')
      .where('t.tokenHash = :h', { h: sha256(rawToken) })
      .getOne();
    if (!t || t.revokedAt || !t.client.isActive) return null;
    if (t.expiresAt && t.expiresAt <= new Date()) return null;
    const now = new Date();
    // Cheap "last used" tracking (at most once a minute per token).
    if (!t.lastUsedAt || now.getTime() - t.lastUsedAt.getTime() > 60_000) {
      void this.tokens.update(t.id, { lastUsedAt: now });
      void this.clients.update(t.clientId, { lastUsedAt: now });
    }
    return { clientId: t.clientId, clientName: t.client.name, tokenId: t.id };
  }

  private async issue(clientId: string, kind: TokenKind, expiresAt: Date | null, label: string | null) {
    const token = generateSecret('dpue_at', 24);
    const saved = await this.tokens.save(
      this.tokens.create({
        clientId,
        kind,
        expiresAt,
        label,
        tokenHash: sha256(token),
        tokenPrefix: token.slice(0, 14),
      }),
    );
    return { token, tokenId: saved.id, expiresAt };
  }
}
