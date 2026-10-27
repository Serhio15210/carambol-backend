import { ApiTags } from '@nestjs/swagger';
import { Controller, Get, Query } from '@nestjs/common';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { AuditService } from './audit.service';

@Auth(UserRole.ADMIN, UserRole.SUPERADMIN)
@ApiTags('admin: audit')
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // GET /api/admin/audit-logs?page=1&limit=20
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.auditService.findAll(query);
  }
}
