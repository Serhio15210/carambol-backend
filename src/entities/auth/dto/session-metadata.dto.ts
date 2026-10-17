import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SessionMetadataDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  ip?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string | null;
}
