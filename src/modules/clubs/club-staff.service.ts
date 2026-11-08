import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '@/modules/audit/audit.service';
import { Actor, UsersService } from '@/modules/users/users.service';
import { ClubsService } from './clubs.service';
import { ClubStaff } from './entities/club-staff.entity';
import { ClubStaffRole } from './types/club-staff-role.enum';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';

@Injectable()
export class ClubStaffService {
  constructor(
    @InjectRepository(ClubStaff)
    private readonly staffRepository: Repository<ClubStaff>,
    private readonly clubs: ClubsService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  // shortcut: no pagination, a club has a handful of staff; a soft-deleted user stays in the list
  // (the foreign key is not touched by a soft delete); add paging and a join with users if needed.
  async findAllByClub(clubId: string): Promise<ClubStaff[]> {
    await this.clubs.findById(clubId); // 404 for an unknown club instead of an empty list
    return this.staffRepository.find({
      where: { clubId },
      order: { createdAt: 'ASC', userId: 'ASC' },
    });
  }

  // TODO(human): make `userId` work in club `clubId` with `role`; calling it again with another
  // role CHANGES the role (one row per pair, PUT is idempotent). Order of checks:
  //   1. the club exists and the user exists (both throw 404 by themselves: this.clubs / this.users);
  //   2. the only owner of a club cannot be demoted to manager: ConflictException (409). Setting
  //      OWNER again, or demoting an owner while ANOTHER owner remains, is fine;
  //   3. save the row and write an audit entry AFTER it: (actor.id, AuditAction.ClubStaffSet, clubId,
  //      { userId, role }). Return the saved row.
  // Allowed repository methods (the test fake knows only these): create, save, findOneBy, countBy.
  // See club-staff.service.spec.ts. Rename the _ parameters once you use them.
  async assign(
    actor: Actor,
    clubId: string,
    userId: string,
    role: ClubStaffRole,
  ): Promise<ClubStaff> {
    await this.users.findById(userId);
    await this.clubs.findById(clubId);
    let staff = await this.staffRepository.findOneBy({
      clubId,
      userId,
    });

    if (!staff) {
      staff = this.staffRepository.create({
        clubId,
        userId,
        role,
      });
    } else {
      const owner = await this.staffRepository.countBy({
        clubId,
        role: ClubStaffRole.OWNER,
      });
      if (owner <= 1 && staff.role === ClubStaffRole.OWNER && role !== ClubStaffRole.OWNER) {
        throw new ConflictException('The only owner cannot be demoted to manager');
      }
      staff.role = role;
    }
    const savedStaff = await this.staffRepository.save(staff);
    await this.audit.record(actor.id, AuditAction.ClubStaffSet, clubId, {
      userId,
      role,
    });
    return savedStaff;
  }

  // TODO(human): remove the person from the club. NotFoundException (404) when the person does not
  // work there. The only owner cannot be removed: ConflictException (409). The audit entry
  // (AuditAction.ClubStaffRemove, target clubId, details { userId }) is written only after the delete.
  // Allowed repository methods: findOneBy, countBy, delete.
  async remove(actor: Actor, clubId: string, userId: string): Promise<void> {
    await this.users.findById(userId);
    await this.clubs.findById(clubId);
    const staff = await this.staffRepository.findOneBy({
      clubId,
      userId,
    });
    if (!staff) {
      throw new NotFoundException(`User ${userId} is not a staff member of club ${clubId}`);
    }
    if (staff.role === ClubStaffRole.OWNER) {
      const ownerCount = await this.staffRepository.countBy({
        clubId,
        role: ClubStaffRole.OWNER,
      });
      if (ownerCount <= 1) {
        throw new ConflictException('The only owner cannot be removed from the club');
      }
    }
    await this.staffRepository.delete({ clubId, userId });
    await this.audit.record(actor.id, AuditAction.ClubStaffRemove, clubId, {
      userId,
    });
  }
}
