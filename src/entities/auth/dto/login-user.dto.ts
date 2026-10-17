import { IsString, MinLength } from 'class-validator';

export class LoginUserDto {
  @IsString()
  @MinLength(1)
  login: string;

  @IsString()
  @MinLength(8)
  password: string;
}
