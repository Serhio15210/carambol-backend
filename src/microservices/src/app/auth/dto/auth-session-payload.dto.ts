import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LoginUserDto } from '@/entities/auth/dto/login-user.dto';
import { CreateUserDto } from '@/entities/users/dto/create-user.dto';
import { SessionMetadataDto } from '@/entities/auth/dto/session-metadata.dto';

export class LoginWithSessionMetadataDto extends LoginUserDto {
  @ValidateNested()
  @Type(() => SessionMetadataDto)
  metadata?: SessionMetadataDto;
}

export class RegisterWithSessionMetadataDto extends CreateUserDto {
  @ValidateNested()
  @Type(() => SessionMetadataDto)
  metadata?: SessionMetadataDto;
}
