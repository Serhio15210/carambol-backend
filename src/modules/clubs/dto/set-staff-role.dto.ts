import { IsEnum } from 'class-validator';
import { ClubStaffRole } from '../types/club-staff-role.enum';

export class SetStaffRoleDto {
  @IsEnum(ClubStaffRole)
  role: ClubStaffRole;
}
