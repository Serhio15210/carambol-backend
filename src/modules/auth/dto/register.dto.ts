import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsString()
  @Matches('^[a-zA-Z0-9_]+$')
  @MaxLength(30, { message: 'Username must be at most 30 characters long' })
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  userName: string;

  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email?: string;

  // E.164 format: +380501234567
  @IsPhoneNumber()
  phone: string;

  @IsString()
  @Matches(/^(?=.*[a-zA-Zа-яА-Я])(?=.*\d).+$/, {
    message: 'Password must contain at least one letter and one digit',
  })
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
