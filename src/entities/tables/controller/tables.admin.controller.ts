import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { CreateTableDto } from '@/entities/tables/dto/create-table.dto';
import { UpdateTableDto } from '@/entities/tables/dto/update-table.dto';
import { Auth } from '@/entities/auth/decorators/auth.decorator';
import { UserRole } from '@/entities/users/model/user.entity';
import { TablesService } from '@/entities/tables/service/tables.service';

@Auth(UserRole.ADMIN)
@Controller('tables')
export class TablesAdminController {
  constructor(private readonly tablesService: TablesService) {}
  @Post('/')
  async createTable(@Body() createTableDto: CreateTableDto) {
    return this.tablesService.createTable(createTableDto);
  }
  @Patch('/:id')
  async updateTable(@Param('id') id: string, @Body() createTableDto: UpdateTableDto) {
    return this.tablesService.updateTable(id, createTableDto);
  }
  @Delete('/:id')
  async deleteTable(@Param('id') id: string) {
    return this.tablesService.deleteTable(id);
  }
}
