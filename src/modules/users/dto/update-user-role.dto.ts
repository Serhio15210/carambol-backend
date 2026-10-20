import { IsEnum } from 'class-validator';
import { UserRole } from '../types/user-role.enum';

export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}
