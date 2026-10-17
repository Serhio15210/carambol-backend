import { Controller, Get, Query } from '@nestjs/common';
import { Auth } from '@/entities/auth/decorators/auth.decorator';
import { UserRole } from '@/entities/users/model/user.entity';
import { TablesService } from '@/entities/tables/service/tables.service';
import { TableQueryDto } from '@/entities/tables/dto/table-query.dto';

@Auth(UserRole.ADMIN)
@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get('/')
  async getAllTables(@Query() query: TableQueryDto) {
    return this.tablesService.getAllTables(query);
  }
}
