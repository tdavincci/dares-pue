import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiClientsService } from './api-clients.service';

/**
 * Protects the Odyssey Standard API. Expects `Authorization: Bearer <token>` where the
 * token was issued from the admin portal (static) or via /token-renewal.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly clients: ApiClientsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
    if (!match) throw new UnauthorizedException('Invalid or missing authorization token');
    const client = await this.clients.validate(match[1]);
    if (!client) throw new UnauthorizedException('Invalid or missing authorization token');
    req.apiClient = client;
    return true;
  }
}
