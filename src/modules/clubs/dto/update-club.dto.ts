import { PartialType } from '@nestjs/swagger';
import { CreateClubDto } from './create-club.dto';

// Every field optional, the same rules as when creating (PartialType copies the validators).
export class UpdateClubDto extends PartialType(CreateClubDto) {}
