import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';
import { User } from './entities/user.entity';
import { UserRole } from './types/user-role.enum';
import { Actor, UsersService } from './users.service';

const superadmin: Actor = { id: 'super', role: UserRole.SUPERADMIN };
const admin: Actor = { id: 'admin', role: UserRole.ADMIN };

const userWith = (role: UserRole, blockedAt: Date | null = null, id = 'target') =>
  ({ id, userName: 'ivan2', role, blockedAt }) as unknown as User;

describe('UsersService admin operations', () => {
  const findOneBy = jest.fn();
  const save = jest.fn();
  const create = jest.fn();
  const merge = jest.fn();
  const softDelete = jest.fn();
  const record = jest.fn();
  let service: UsersService;

  beforeEach(() => {
    jest.resetAllMocks();
    save.mockImplementation((user: User) => Promise.resolve({ ...user, id: user.id ?? 'new' }));
    create.mockImplementation((input: Partial<User>) => input);
    record.mockResolvedValue(undefined);
    service = new UsersService(
      { findOneBy, save, create, merge, softDelete } as unknown as Repository<User>,
      { record } as unknown as AuditService,
    );
  });

  // Expects a 403 with no side effects: nothing saved, nothing audited.
  const expectForbidden = async (action: Promise<unknown>) => {
    await expect(action).rejects.toBeInstanceOf(ForbiddenException);
    expect(save).not.toHaveBeenCalled();
    expect(softDelete).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  };

  describe('setBlocked', () => {
    it('blocks a user and writes an audit entry', async () => {
      findOneBy.mockResolvedValue(userWith(UserRole.USER));

      const result = await service.setBlocked(admin, 'target', true);

      expect(result.blockedAt).toBeInstanceOf(Date);
      expect(record.mock.calls[0].slice(0, 3)).toEqual(['admin', AuditAction.UserBlock, 'target']);
    });

    it('unblocks a blocked user and writes an audit entry', async () => {
      findOneBy.mockResolvedValue(userWith(UserRole.USER, new Date()));

      const result = await service.setBlocked(admin, 'target', false);

      expect(result.blockedAt).toBeNull();
      expect(record.mock.calls[0].slice(0, 3)).toEqual([
        'admin',
        AuditAction.UserUnblock,
        'target',
      ]);
    });

    it('returns 409 when the user is already in the requested state', async () => {
      findOneBy.mockResolvedValue(userWith(UserRole.USER));

      await expect(service.setBlocked(admin, 'target', false)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(save).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown user', async () => {
      findOneBy.mockResolvedValue(null);

      await expect(service.setBlocked(admin, 'ghost', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('role hierarchy', () => {
    it('forbids an admin to block themselves (equal rank)', async () => {
      findOneBy.mockResolvedValue(userWith(UserRole.ADMIN, null, 'admin'));

      await expectForbidden(service.setBlocked(admin, 'admin', true));
    });

    it('forbids an admin to block another admin', async () => {
      findOneBy.mockResolvedValue(userWith(UserRole.ADMIN));

      await expectForbidden(service.setBlocked(admin, 'target', true));
    });

    it('forbids an admin to touch a superadmin', async () => {
      findOneBy.mockResolvedValue(userWith(UserRole.SUPERADMIN));

      await expectForbidden(service.softDelete(admin, 'target'));
    });

    it('lets a superadmin block an admin', async () => {
      findOneBy.mockResolvedValue(userWith(UserRole.ADMIN));

      const result = await service.setBlocked(superadmin, 'target', true);

      expect(result.blockedAt).toBeInstanceOf(Date);
    });

    it('forbids an admin to edit or delete another admin', async () => {
      findOneBy.mockResolvedValue(userWith(UserRole.ADMIN));

      await expectForbidden(service.updateByAdmin(admin, 'target', { firstName: 'X' }));
      await expectForbidden(service.softDelete(admin, 'target'));
    });

    it('forbids an admin to promote a user to admin', async () => {
      findOneBy.mockResolvedValue(userWith(UserRole.USER));

      await expectForbidden(service.updateRole(admin, 'target', UserRole.ADMIN));
    });

    it('lets a superadmin promote a user to admin', async () => {
      findOneBy.mockResolvedValue(userWith(UserRole.USER));

      const result = await service.updateRole(superadmin, 'target', UserRole.ADMIN);

      expect(result.role).toBe(UserRole.ADMIN);
    });

    it('forbids anyone to grant the superadmin role', async () => {
      findOneBy.mockResolvedValue(userWith(UserRole.USER));

      await expectForbidden(service.updateRole(superadmin, 'target', UserRole.SUPERADMIN));
    });

    it('lets an admin create a user but not an admin', async () => {
      const dto = {
        userName: 'new_one',
        firstName: 'New',
        lastName: 'One',
        phone: '+380670000000',
        password: 'password123',
      };

      await service.createByAdmin(admin, dto); // no role → 'user'
      expect(record).toHaveBeenCalled();

      jest.clearAllMocks(); // forget the calls above, keep the mock implementations
      await expectForbidden(service.createByAdmin(admin, { ...dto, role: UserRole.ADMIN }));
    });
  });
});
