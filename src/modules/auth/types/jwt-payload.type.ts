import { UserRole } from '@/modules/users/types/user-role.enum';

// Что лежит внутри access-токена. JWT НЕ шифруется: любой может
// раскодировать его на jwt.io. Поэтому кладём только id и роль, без личных данных.
// sub (subject) — стандартное имя поля «кому выдан токен».
export type JwtPayload = {
  sub: string;
  role: UserRole;
};
