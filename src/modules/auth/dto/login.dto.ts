import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  // email, userName или телефон
  @IsString()
  @MinLength(1)
  login: string;

  @IsString()
  @MinLength(1)
  password: string;
}
