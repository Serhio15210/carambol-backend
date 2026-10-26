import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { UsersService } from '@/modules/users/users.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy.validate', () => {
  const findOneById = jest.fn();
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.resetAllMocks();
    strategy = new JwtStrategy(
      { getOrThrow: () => 'test-secret' } as unknown as ConfigService,
      { findOneById } as unknown as UsersService,
    );
  });

  it('returns the id and role of an existing user', async () => {
    findOneById.mockResolvedValue({ id: 'u1', role: UserRole.USER });

    const result = await strategy.validate({ sub: 'u1', role: UserRole.USER });

    expect(result).toEqual({ id: 'u1', role: UserRole.USER });
  });

  it('uses the CURRENT role from the database, not the role inside the token', async () => {
    // the token was issued when the user was an admin, but they were demoted since
    findOneById.mockResolvedValue({ id: 'u1', role: UserRole.USER });

    const result = await strategy.validate({ sub: 'u1', role: UserRole.ADMIN });

    expect(result.role).toBe(UserRole.USER);
  });

  it('rejects a token of a user who no longer exists', async () => {
    findOneById.mockResolvedValue(null);

    await expect(
      Promise.resolve(strategy.validate({ sub: 'u1', role: UserRole.USER })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a blocked user', async () => {
    findOneById.mockResolvedValue({ id: 'u1', role: UserRole.USER, blockedAt: new Date() });

    await expect(
      Promise.resolve(strategy.validate({ sub: 'u1', role: UserRole.USER })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
