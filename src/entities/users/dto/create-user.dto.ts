import { IsEmail, IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  userName: string;

  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @IsPhoneNumber()
  phone: string;

  @IsString()
  @MinLength(8)
  password: string;
}
