import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';
import { Actor, UsersService } from '@/modules/users/users.service';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { ClubStaffService } from './club-staff.service';
import { ClubsService } from './clubs.service';
import { ClubStaff } from './entities/club-staff.entity';
import { ClubStaffRole } from './types/club-staff-role.enum';

type Pair = { clubId: string; userId: string };

// In-memory stand-in for Repository<ClubStaff>. It knows ONLY the methods the lesson allows,
// and, like the real table, it keeps one row per (clubId, userId) pair: save() on an existing
// pair updates that row instead of adding a second one.
class FakeStaffRepository {
  rows: ClubStaff[] = [];

  create = (data: Partial<ClubStaff>) => ({ ...data }) as ClubStaff;

  save = (row: ClubStaff) => {
    const saved = { ...row, createdAt: row.createdAt ?? new Date() };
    this.rows = [...this.rows.filter((r) => !this.samePair(r, row)), saved];
    return Promise.resolve(Object.assign(row, saved));
  };

  findOneBy = (where: Pair) => {
    const row = this.rows.find((r) => this.samePair(r, where));
    return Promise.resolve(row ? { ...row } : null);
  };

  countBy = (where: { clubId: string; role: ClubStaffRole }) =>
    Promise.resolve(
      this.rows.filter((r) => r.clubId === where.clubId && r.role === where.role).length,
    );

  delete = (where: Pair) => {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !this.samePair(r, where));
    return Promise.resolve({ affected: before - this.rows.length });
  };

  find = ({ where }: { where: { clubId: string } }) =>
    Promise.resolve(this.rows.filter((r) => r.clubId === where.clubId).map((r) => ({ ...r })));

  private samePair = (a: Pair, b: Pair) => a.clubId === b.clubId && a.userId === b.userId;

  seed(clubId: string, userId: string, role: ClubStaffRole) {
    this.rows.push({ clubId, userId, role, createdAt: new Date() } as ClubStaff);
  }
}

const actor: Actor = { id: 'admin', role: UserRole.ADMIN };

// "ghost" does not exist, everything else does: the real services throw 404 for a missing id.
const exists = (what: string) =>
  jest.fn((id: string) =>
    id === 'ghost'
      ? Promise.reject(new NotFoundException(`${what} ${id} not found`))
      : Promise.resolve({ id }),
  );

describe('ClubStaffService', () => {
  let repo: FakeStaffRepository;
  let service: ClubStaffService;
  const record = jest.fn();

  beforeEach(() => {
    record.mockReset().mockResolvedValue(undefined);
    repo = new FakeStaffRepository();
    service = new ClubStaffService(
      repo as unknown as Repository<ClubStaff>,
      { findById: exists('Club') } as unknown as ClubsService,
      { findById: exists('User') } as unknown as UsersService,
      { record } as unknown as AuditService,
    );
  });

  describe('findAllByClub (provided)', () => {
    it('lists only the staff of that club', async () => {
      repo.seed('club-1', 'u1', ClubStaffRole.OWNER);
      repo.seed('club-2', 'u2', ClubStaffRole.MANAGER);

      const staff = await service.findAllByClub('club-1');

      expect(staff.map((s) => s.userId)).toEqual(['u1']);
    });

    it('returns 404 for an unknown club instead of an empty list', async () => {
      await expect(service.findAllByClub('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assign (your part)', () => {
    it('stores the assignment and returns it', async () => {
      const row = await service.assign(actor, 'club-1', 'u1', ClubStaffRole.MANAGER);

      expect(row).toMatchObject({ clubId: 'club-1', userId: 'u1', role: ClubStaffRole.MANAGER });
      expect(repo.rows).toHaveLength(1);
    });

    it('writes an audit entry with the club id and the details', async () => {
      await service.assign(actor, 'club-1', 'u1', ClubStaffRole.MANAGER);

      expect(record).toHaveBeenCalledWith('admin', AuditAction.ClubStaffSet, 'club-1', {
        userId: 'u1',
        role: ClubStaffRole.MANAGER,
      });
    });

    it('called again with another role changes the role, there is still one row', async () => {
      await service.assign(actor, 'club-1', 'u1', ClubStaffRole.MANAGER);

      await service.assign(actor, 'club-1', 'u1', ClubStaffRole.OWNER);

      expect(repo.rows).toHaveLength(1);
      expect(repo.rows[0].role).toBe(ClubStaffRole.OWNER);
    });

    it('returns 404 for an unknown club or user and stores nothing', async () => {
      await expect(
        service.assign(actor, 'ghost', 'u1', ClubStaffRole.MANAGER),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.assign(actor, 'club-1', 'ghost', ClubStaffRole.MANAGER),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.rows).toHaveLength(0);
      expect(record).not.toHaveBeenCalled();
    });

    it('refuses to demote the only owner (409) and writes nothing', async () => {
      repo.seed('club-1', 'u1', ClubStaffRole.OWNER);

      await expect(
        service.assign(actor, 'club-1', 'u1', ClubStaffRole.MANAGER),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.rows[0].role).toBe(ClubStaffRole.OWNER);
      expect(record).not.toHaveBeenCalled();
    });

    it('allows demoting an owner while another owner remains', async () => {
      repo.seed('club-1', 'u1', ClubStaffRole.OWNER);
      repo.seed('club-1', 'u2', ClubStaffRole.OWNER);

      await service.assign(actor, 'club-1', 'u1', ClubStaffRole.MANAGER);

      expect(repo.rows.find((r) => r.userId === 'u1')?.role).toBe(ClubStaffRole.MANAGER);
    });

    it('allows setting OWNER on the only owner again (nothing is lost)', async () => {
      repo.seed('club-1', 'u1', ClubStaffRole.OWNER);

      await expect(
        service.assign(actor, 'club-1', 'u1', ClubStaffRole.OWNER),
      ).resolves.toMatchObject({ role: ClubStaffRole.OWNER });
    });

    it('counts owners per club: an owner of ANOTHER club does not save the demotion', async () => {
      repo.seed('club-1', 'u1', ClubStaffRole.OWNER);
      repo.seed('club-2', 'u2', ClubStaffRole.OWNER);

      await expect(
        service.assign(actor, 'club-1', 'u1', ClubStaffRole.MANAGER),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove (your part)', () => {
    it('deletes the assignment and writes an audit entry', async () => {
      repo.seed('club-1', 'u1', ClubStaffRole.MANAGER);

      await service.remove(actor, 'club-1', 'u1');

      expect(repo.rows).toHaveLength(0);
      expect(record).toHaveBeenCalledWith('admin', AuditAction.ClubStaffRemove, 'club-1', {
        userId: 'u1',
      });
    });

    it('returns 404 when the person does not work in that club', async () => {
      repo.seed('club-2', 'u1', ClubStaffRole.MANAGER); // same person, ANOTHER club

      await expect(service.remove(actor, 'club-1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
      expect(record).not.toHaveBeenCalled();
    });

    it('refuses to remove the only owner (409), nothing is deleted or logged', async () => {
      repo.seed('club-1', 'u1', ClubStaffRole.OWNER);
      repo.seed('club-1', 'u2', ClubStaffRole.MANAGER);

      await expect(service.remove(actor, 'club-1', 'u1')).rejects.toBeInstanceOf(ConflictException);
      expect(repo.rows).toHaveLength(2);
      expect(record).not.toHaveBeenCalled();
    });

    it('allows removing an owner while another owner remains', async () => {
      repo.seed('club-1', 'u1', ClubStaffRole.OWNER);
      repo.seed('club-1', 'u2', ClubStaffRole.OWNER);

      await service.remove(actor, 'club-1', 'u1');

      expect(repo.rows.map((r) => r.userId)).toEqual(['u2']);
    });

    it('writes no audit entry when the database refuses the delete', async () => {
      repo.seed('club-1', 'u1', ClubStaffRole.MANAGER);
      repo.delete = () => Promise.reject(new Error('boom'));

      await expect(service.remove(actor, 'club-1', 'u1')).rejects.toThrow('boom');
      expect(record).not.toHaveBeenCalled();
    });
  });
});
