import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@/modules/users/types/user-role.enum';

export const ROLES_KEY = 'roles';

// Декоратор сам ничего не проверяет: он только «приклеивает» к методу или классу
// метку { roles: [...] }. Читает её RolesGuard через Reflector.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
