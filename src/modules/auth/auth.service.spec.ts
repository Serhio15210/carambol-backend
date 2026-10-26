import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { User } from '@/modules/users/entities/user.entity';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { UsersService } from '@/modules/users/users.service';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';

const metadata = { ip: '127.0.0.1', userAgent: 'jest' };
const tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };

describe('AuthService.login', () => {
  const findByLoginWithPassword = jest.fn();
  const createSession = jest.fn();
  let service: AuthService;
  let user: User;

  beforeAll(async () => {
    user = {
      id: 'user-1',
      userName: 'Ivan_1',
      firstName: 'Ivan',
      lastName: 'Petrenko',
      email: 'ivan@example.com',
      phone: '+380671234567',
      role: UserRole.USER,
      blockedAt: null,
      deletedAt: null,
      passwordHash: await hash('password123', 4), // low cost keeps the test fast
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  beforeEach(() => {
    jest.resetAllMocks();
    findByLoginWithPassword.mockResolvedValue(user);
    createSession.mockResolvedValue(tokens);
    service = new AuthService(
      { findByLoginWithPassword } as unknown as UsersService,
      { createSession } as unknown as SessionsService,
    );
  });

  it('returns tokens and a public user without passwordHash', async () => {
    const result = await service.login(
      { login: 'ivan@example.com', password: 'password123' },
      metadata,
    );

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.user.id).toBe('user-1');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(createSession).toHaveBeenCalledWith(user, metadata);
  });

  it('rejects an unknown login and creates no session', async () => {
    findByLoginWithPassword.mockResolvedValue(null);

    await expect(
      service.login({ login: 'nobody', password: 'password123' }, metadata),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('rejects a wrong password and creates no session', async () => {
    await expect(
      service.login({ login: 'ivan@example.com', password: 'wrong-password' }, metadata),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('gives the same error for an unknown login and a wrong password', async () => {
    const wrongPassword = await service
      .login({ login: 'ivan@example.com', password: 'wrong-password' }, metadata)
      .catch((e: Error) => e);

    findByLoginWithPassword.mockResolvedValue(null);
    const unknownLogin = await service
      .login({ login: 'nobody', password: 'password123' }, metadata)
      .catch((e: Error) => e);

    expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
    expect(unknownLogin).toBeInstanceOf(UnauthorizedException);
    expect((wrongPassword as Error).message).toBe((unknownLogin as Error).message);
  });

  it('trims and lowercases an email login', async () => {
    await service.login({ login: '  IVAN@Example.COM ', password: 'password123' }, metadata);

    expect(findByLoginWithPassword).toHaveBeenCalledWith('ivan@example.com');
  });

  it('only trims a userName login (usernames are case-sensitive)', async () => {
    await service.login({ login: ' Ivan_1 ', password: 'password123' }, metadata);

    expect(findByLoginWithPassword).toHaveBeenCalledWith('Ivan_1');
  });

  it('rejects a blocked user with 403 only after a correct password', async () => {
    findByLoginWithPassword.mockResolvedValue({ ...user, blockedAt: new Date() });

    await expect(
      service.login({ login: 'ivan@example.com', password: 'password123' }, metadata),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(createSession).not.toHaveBeenCalled();
  });
});
