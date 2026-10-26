import { IsEnum, IsOptional } from 'class-validator';
import { RegisterDto } from '@/modules/auth/dto/register.dto';
import { UserRole } from '../types/user-role.enum';

// Same rules as self-registration, plus the admin may set the role right away.
export class CreateUserByAdminDto extends RegisterDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
