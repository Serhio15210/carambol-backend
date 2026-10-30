import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { BilliardTablesService } from './billiard-tables.service';
import { GetBilliardTablesQueryDto } from './dto/get-billiard-tables-query.dto';

// Read-only for any logged-in user (players need the tables to book them).
// Changes live in AdminBilliardTablesController, so roles are set once per class, not per method.
@Auth()
@ApiTags('tables')
@Controller('tables')
export class BilliardTablesController {
  constructor(private readonly tablesService: BilliardTablesService) {}

  // GET /api/v1/tables?type=pool&status=active&page=1&limit=20
  @Get()
  findAll(@Query() query: GetBilliardTablesQueryDto) {
    return this.tablesService.findAll(query);
  }

  // GET /api/v1/tables/:id
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tablesService.findById(id);
  }
}
