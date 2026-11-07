import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user.entity';
import { AuthUser, ROLES_KEY } from './auth.decorators';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

/** Guards admin-portal routes with a JWT issued by /auth/login, plus optional role checks. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const [scheme, token] = (header ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('Missing bearer token');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const user = await this.users.findById(payload.sub).catch(() => null);
    if (!user || !user.isActive) throw new UnauthorizedException('Account disabled');

    const authUser: AuthUser = { id: user.id, email: user.email, role: user.role, fullName: user.fullName };
    req.user = authUser;

    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (required?.length && user.role !== UserRole.ADMIN && !required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
