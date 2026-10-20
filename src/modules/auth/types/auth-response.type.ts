import { PublicUser } from '@/modules/users/types/public-user.type';

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResponse = TokenPair & {
  user: PublicUser;
};

export type SessionMetadata = {
  ip: string | null;
  userAgent: string | null;
};
