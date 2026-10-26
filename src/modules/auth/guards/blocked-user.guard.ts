import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ALLOW_BLOCKED_KEY } from '../decorators/allow-blocked.decorator';
import { RequestUser } from '../types/request-user.type';

// Runs after JwtAuthGuard (request.user is filled). A blocked user passes only
// routes marked with @AllowBlocked(); a guard runs BEFORE the handler, so nothing is executed.
@Injectable()
export class BlockedUserGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowBlocked = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_BLOCKED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();

    if (request.user?.isBlocked && !allowBlocked) {
      // An explicit message instead of `return false`, so the client can show "your account is blocked".
      throw new ForbiddenException('Account is blocked');
    }
    return true;
  }
}
