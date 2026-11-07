import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { UserRole } from '../users/user.entity';

export const ROLES_KEY = 'roles';
/** Restrict an admin route to the given roles (ADMIN always passes). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export class AuthUser {
  id!: string;
  email!: string;
  role!: UserRole;
  fullName!: string;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
