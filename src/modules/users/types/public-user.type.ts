import { User } from '../entities/user.entity';

// Пользователь в том виде, в каком его можно отдавать клиенту.
export type PublicUser = Omit<User, 'passwordHash' | 'deletedAt'>;

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  userName: user.userName,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  blockedAt: user.blockedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});
