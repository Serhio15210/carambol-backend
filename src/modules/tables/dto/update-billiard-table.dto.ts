import { CreateBilliardTableDto } from '@/modules/tables/dto/create-billiard-table.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateBilliardTableDto extends PartialType(CreateBilliardTableDto) {}
