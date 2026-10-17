import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';
import { PasswordResetChannel } from '@/microservices/src/app/auth/dto/reset-user-password.dto';

export class PasswordResetRequestedEventDto {
  @IsString()
  @MinLength(1)
  eventId: string;

  @IsString()
  @MinLength(1)
  userId: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @IsOptional()
  @IsString()
  resetUrl?: string;

  @IsOptional()
  @IsString()
  otpCode?: string;

  @IsOptional()
  @IsIn(['email', 'phone'])
  channel?: PasswordResetChannel;

  @IsString()
  requestedAt: string;
}

export class OrderMailEventDto {
  @IsString()
  @MinLength(1)
  eventId: string;

  @IsString()
  @MinLength(1)
  orderId: string;

  @IsString()
  @MinLength(1)
  userId: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @IsString()
  @MinLength(1)
  userName: string;

  @IsArray()
  @IsString({ each: true })
  tableNames: string[];

  @IsString()
  startsAt: string;

  @IsString()
  endsAt: string;

  @IsInt()
  totalAmount: number;

  @IsString()
  occurredAt: string;
}
