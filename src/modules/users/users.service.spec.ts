import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';
import { User } from './entities/user.entity';
import { UserRole } from './types/user-role.enum';
import { UsersService } from './users.service';

describe('UsersService.setBlocked', () => {
  const findOneBy = jest.fn();
  const save = jest.fn();
  const record = jest.fn();
  let service: UsersService;

  const activeUser = () =>
    ({ id: 'target', userName: 'ivan2', role: UserRole.USER, blockedAt: null }) as unknown as User;

  beforeEach(() => {
    jest.resetAllMocks();
    save.mockImplementation((user: User) => Promise.resolve(user));
    record.mockResolvedValue(undefined);
    service = new UsersService(
      { findOneBy, save } as unknown as Repository<User>,
      { record } as unknown as AuditService,
    );
  });

  it('blocks another user and writes an audit entry', async () => {
    findOneBy.mockResolvedValue(activeUser());

    const result = await service.setBlocked('admin', 'target', true);

    expect(result.blockedAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalled();
    expect(record.mock.calls[0].slice(0, 3)).toEqual(['admin', AuditAction.UserBlock, 'target']);
  });

  it('unblocks a blocked user and writes an audit entry', async () => {
    findOneBy.mockResolvedValue({ ...activeUser(), blockedAt: new Date() });

    const result = await service.setBlocked('admin', 'target', false);

    expect(result.blockedAt).toBeNull();
    expect(record.mock.calls[0].slice(0, 3)).toEqual(['admin', AuditAction.UserUnblock, 'target']);
  });

  it('forbids an admin to block themselves', async () => {
    await expect(
      Promise.resolve().then(() => service.setBlocked('admin', 'admin', true)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(save).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('returns 409 when the user is already in the requested state', async () => {
    findOneBy.mockResolvedValue(activeUser()); // not blocked, and we ask to unblock

    await expect(
      Promise.resolve().then(() => service.setBlocked('admin', 'target', false)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(save).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown user', async () => {
    findOneBy.mockResolvedValue(null);

    await expect(
      Promise.resolve().then(() => service.setBlocked('admin', 'ghost', true)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
