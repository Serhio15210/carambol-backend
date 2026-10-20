import { IsEmail, IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  userName: string;

  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // Формат E.164: +380501234567
  @IsPhoneNumber()
  phone: string;

  @IsString()
  @MinLength(8)
  password: string;
}
