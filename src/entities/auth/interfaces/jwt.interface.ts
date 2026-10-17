import { UserRole } from '@/entities/users/model/user.entity';

export type JwtPayload = {
  sub: string;
  email?: string | null;
  userName: string;
  role: UserRole;
};
