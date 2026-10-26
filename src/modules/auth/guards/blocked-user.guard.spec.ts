import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { AllowBlocked } from '../decorators/allow-blocked.decorator';
import { RequestUser } from '../types/request-user.type';
import { BlockedUserGuard } from './blocked-user.guard';

// Fake route handlers: the real decorator writes real metadata, and the real Reflector reads it.
class FakeController {}
const regular = () => {};
const allowed = () => {};
AllowBlocked()(allowed);

const contextFor = (handler: () => void, user: RequestUser) =>
  ({
    getHandler: () => handler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('BlockedUserGuard', () => {
  const guard = new BlockedUserGuard(new Reflector());
  const active: RequestUser = { id: 'u1', role: UserRole.USER, isBlocked: false };
  const blocked: RequestUser = { ...active, isBlocked: true };

  it('lets an active user through', () => {
    expect(guard.canActivate(contextFor(regular, active))).toBe(true);
  });

  it('stops a blocked user with 403 on a regular route', () => {
    expect(() => guard.canActivate(contextFor(regular, blocked))).toThrow(ForbiddenException);
  });

  it('lets a blocked user through on an @AllowBlocked route', () => {
    expect(guard.canActivate(contextFor(allowed, blocked))).toBe(true);
  });
});
