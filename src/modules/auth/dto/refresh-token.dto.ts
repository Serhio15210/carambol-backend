import { IsString, MinLength } from 'class-validator';

// Используется и для /auth/refresh, и для /auth/logout.
export class RefreshTokenDto {
  @IsString()
  @MinLength(1)
  refreshToken: string;
}
