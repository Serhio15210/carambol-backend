import { UserRole } from '@/entities/users/model/user.entity';

export interface User {
  id: string;
  email: string | null;
  role: UserRole;
  userName: string;
  firstName: string;
  lastName: string;
  phone: string;
  attendanceCount: number;
}

export type AuthUser = Pick<User, 'id' | 'email' | 'role' | 'userName' | 'phone'>;

export type RequestUser = Pick<User, 'id' | 'role' | 'userName' | 'email'>;

export type PaginatedResponse<T> = {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};
