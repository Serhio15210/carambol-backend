import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BilliardTable } from '@/modules/tables/entities/billiard-table.entity';
import { paginate, PaginatedResponse } from '@/common/types/paginated-response.type';
import { GetBilliardTablesQueryDto } from '@/modules/tables/dto/get-billiard-tables-query.dto';
import { CreateBilliardTableDto } from '@/modules/tables/dto/create-billiard-table.dto';
import { UpdateBilliardTableDto } from '@/modules/tables/dto/update-billiard-table.dto';
import { AuditService } from '@/modules/audit/audit.service';
import { Actor } from '@/modules/users/users.service';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';
import { MIN_GAP_CM, TablePlacement, tablesOverlap } from './table-layout';

@Injectable()
export class BilliardTablesService {
  constructor(
    @InjectRepository(BilliardTable)
    private readonly billiardTablesRepository: Repository<BilliardTable>,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: GetBilliardTablesQueryDto): Promise<PaginatedResponse<BilliardTable>> {
    const { page, limit, type, status } = query;

    const qb = this.billiardTablesRepository.findAndCount({
      where: { type, status },
      order: { number: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const [tables, total] = await qb;
    return paginate(tables, total, page, limit);
  }
  async findById(id: string): Promise<BilliardTable> {
    const table = await this.billiardTablesRepository.findOneBy({ id });
    if (!table) {
      throw new NotFoundException(`Table ${id} not found`);
    }
    return table;
  }
  async create(actor: Actor, dto: CreateBilliardTableDto): Promise<BilliardTable> {
    // The DB default (0) arrives only on INSERT, but the spot check needs the rotation now.
    // Not a default in the DTO: PartialType copies initializers, and PATCH would reset rotation.
    const table = this.billiardTablesRepository.create({ ...dto, rotation: dto.rotation ?? 0 });
    await this.assertSpotIsFree(table);
    const createdTable = await this.billiardTablesRepository.save(table);
    await this.audit.record(actor.id, AuditAction.TableCreate, table.id);
    return createdTable;
  }
  async update(actor: Actor, id: string, dto: UpdateBilliardTableDto): Promise<BilliardTable> {
    const table = await this.findById(id);
    if (!table) {
      throw new NotFoundException(`Table not found`);
    }

    // Check the NEW placement (old values + the sent fields), ignoring the table's own old spot.
    this.billiardTablesRepository.merge(table, dto);
    await this.assertSpotIsFree(table, table.id);
    const updatedTable = await this.billiardTablesRepository.save(table);
    await this.audit.record(actor.id, AuditAction.TableUpdate, table.id);
    return updatedTable;
  }
  async softDelete(actor: Actor, id: string): Promise<void> {
    const table = await this.findById(id);
    if (!table) {
      throw new NotFoundException(`Table not found`);
    }
    await this.billiardTablesRepository.softDelete(table.id);
    await this.audit.record(actor.id, AuditAction.TableDelete, table.id);
  }
  async restore(actor: Actor, id: string): Promise<BilliardTable> {
    const table = await this.billiardTablesRepository.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!table) {
      throw new NotFoundException(`Deleted table not found`);
    }
    if (table.deletedAt === null) {
      throw new ConflictException(`Table is not deleted`);
    }
    // While the table was deleted, another one may have taken its spot.
    await this.assertSpotIsFree(table);

    await this.billiardTablesRepository.restore(table.id);

    await this.audit.record(actor.id, AuditAction.TableRestore, table.id);
    const restoredTable = await this.findById(table.id);
    if (!restoredTable) {
      throw new NotFoundException(`Table not found after restore`);
    }
    return restoredTable;
  }

  // The placement must keep MIN_GAP_CM from every other active table.
  // shortcut: loads every table and checks in code, so two admins saving at the same moment
  // can both pass; fine for dozens of tables. Lesson 15 narrows it to one room,
  // lesson 17 shows the database-level fix (exclusion constraint).
  private async assertSpotIsFree(placement: TablePlacement, selfId?: string): Promise<void> {
    const others = (await this.billiardTablesRepository.find()).filter((t) => t.id !== selfId);
    const blocker = others.find((other) => tablesOverlap(placement, other, MIN_GAP_CM));
    if (blocker) {
      throw new ConflictException(
        `Too close to table ${blocker.number}: keep at least ${MIN_GAP_CM} cm between tables`,
      );
    }
  }
}
