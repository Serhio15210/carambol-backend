import { AuthUser } from '@/entities/users/interfaces/user.interface';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
