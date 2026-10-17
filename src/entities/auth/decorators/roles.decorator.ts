import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@/entities/users/model/user.entity';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => {
  return SetMetadata(ROLES_KEY, roles);
};
