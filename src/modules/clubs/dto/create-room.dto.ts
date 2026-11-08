import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
import { trim } from '@/common/transforms/trim.transform';

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trim)
  name: string;

  @IsInt()
  @Min(100)
  @Max(20000)
  widthCm: number;

  @IsInt()
  @Min(100)
  @Max(20000)
  lengthCm: number;
}
