import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { RequestUser } from '@/modules/auth/types/request-user.type';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { BilliardTablesService } from './billiard-tables.service';
import { CreateBilliardTableDto } from './dto/create-billiard-table.dto';
import { UpdateBilliardTableDto } from './dto/update-billiard-table.dto';

// Admins manage the tables; the acting admin goes to the audit log.
@Auth(UserRole.ADMIN, UserRole.SUPERADMIN)
@ApiTags('admin: tables')
@Controller('admin/tables')
export class AdminBilliardTablesController {
  constructor(private readonly tablesService: BilliardTablesService) {}

  // POST /api/v1/admin/tables
  @Post()
  create(@CurrentUser() actor: RequestUser, @Body() body: CreateBilliardTableDto) {
    return this.tablesService.create(actor, body);
  }

  // PATCH /api/v1/admin/tables/:id   (only the fields that were sent)
  @Patch(':id')
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBilliardTableDto,
  ) {
    return this.tablesService.update(actor, id, body);
  }

  // DELETE /api/v1/admin/tables/:id   (soft delete: the row stays, deletedAt is filled)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tablesService.softDelete(actor, id);
  }

  // POST /api/v1/admin/tables/:id/restore   (an action endpoint, see lesson 11)
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tablesService.restore(actor, id);
  }
}
