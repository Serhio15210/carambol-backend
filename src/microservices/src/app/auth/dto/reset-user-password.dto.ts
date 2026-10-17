import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
export type PasswordResetChannel = 'email' | 'phone';
export class RequestPasswordResetDto {
  @IsString()
  @MinLength(1)
  login: string;

  @IsOptional()
  @IsIn(['email', 'phone'])
  channel?: PasswordResetChannel;
}
export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class ConfirmOtpCodeDto {
  @IsString()
  @MinLength(4)
  code: string;

  @IsString()
  @MinLength(1)
  login: string;
}
