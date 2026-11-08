import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateBilliardTableDto } from '@/modules/tables/dto/create-billiard-table.dto';

// A table never moves to another room (that is a different placement check): roomId is not editable.
export class UpdateBilliardTableDto extends PartialType(
  OmitType(CreateBilliardTableDto, ['roomId'] as const),
) {}
