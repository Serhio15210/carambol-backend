import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { paginate, PaginatedResponse } from '@/common/types/paginated-response.type';
import { AuditLog } from './entities/audit-log.entity';
import { AuditAction } from './types/audit-action.enum';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  // shortcut: written after the change, not in the same transaction, so a crash in between
  // loses the entry; use a transaction (lesson 17) or the outbox (lesson 23) when audit must be guaranteed.
  async record(
    actorId: string,
    action: AuditAction,
    targetId: string | null,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.auditRepository.save(
      this.auditRepository.create({ actorId, action, targetId, details: details ?? null }),
    );
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResponse<AuditLog>> {
    const { page, limit } = query;
    const [items, total] = await this.auditRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginate(items, total, page, limit);
  }
}
