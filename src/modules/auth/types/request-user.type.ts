import { UserRole } from '@/modules/users/types/user-role.enum';

// Объект, который JwtStrategy кладёт в request.user после проверки токена.
export type RequestUser = {
  id: string;
  role: UserRole;
};
