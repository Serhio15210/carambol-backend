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
import { Room } from '@/modules/clubs/entities/room.entity';
import { RoomsService } from '@/modules/clubs/rooms.service';
import { isInsideRoom, TablePlacement, tablesOverlap } from './table-layout';

@Injectable()
export class BilliardTablesService {
  constructor(
    @InjectRepository(BilliardTable)
    private readonly billiardTablesRepository: Repository<BilliardTable>,
    private readonly rooms: RoomsService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: GetBilliardTablesQueryDto): Promise<PaginatedResponse<BilliardTable>> {
    const { page, limit, roomId, type, status } = query;

    const qb = this.billiardTablesRepository.findAndCount({
      where: { roomId, type, status },
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
    const room = await this.rooms.findRoomWithClub(dto.roomId); // 404 for an unknown room
    // The DB default (0) arrives only on INSERT, but the placement check needs the rotation now.
    // Not a default in the DTO: PartialType copies initializers, and PATCH would reset rotation.
    const table = this.billiardTablesRepository.create({ ...dto, rotation: dto.rotation ?? 0 });
    await this.assertPlacementIsValid(table, room);
    const createdTable = await this.billiardTablesRepository.save(table);
    await this.audit.record(actor.id, AuditAction.TableCreate, createdTable.id);
    return createdTable;
  }
  async update(actor: Actor, id: string, dto: UpdateBilliardTableDto): Promise<BilliardTable> {
    const table = await this.findById(id);
    if (!table) {
      throw new NotFoundException(`Table not found`);
    }

    // Check the NEW placement (old values + the sent fields) in the table's own room,
    // ignoring the table's old spot. The room never changes (roomId is not in the update DTO).
    const room = await this.rooms.findRoomWithClub(table.roomId);
    this.billiardTablesRepository.merge(table, dto);
    await this.assertPlacementIsValid(table, room, table.id);
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
    // While the table was deleted, another one may have taken its spot (or the room got smaller).
    const room = await this.rooms.findRoomWithClub(table.roomId);
    await this.assertPlacementIsValid(table, room);

    await this.billiardTablesRepository.restore(table.id);

    await this.audit.record(actor.id, AuditAction.TableRestore, table.id);
    const restoredTable = await this.findById(table.id);
    if (!restoredTable) {
      throw new NotFoundException(`Table not found after restore`);
    }
    return restoredTable;
  }

  // The placement must fit inside the room and keep the club's passage (minGapCm) from the walls
  // and from every other active table of the SAME room.
  // shortcut: reads the room's tables and checks in code, so two admins saving at the same moment
  // can both pass; lesson 17 shows the database-level fix (exclusion constraint).
  private async assertPlacementIsValid(
    placement: TablePlacement,
    room: Room,
    selfId?: string,
  ): Promise<void> {
    const gapCm = room.club.minGapCm;
    if (!isInsideRoom(placement, room, gapCm)) {
      throw new ConflictException(
        `The table does not fit in room "${room.name}" (${room.widthCm} × ${room.lengthCm} cm): keep ${gapCm} cm from the walls`,
      );
    }
    const roomTables = await this.billiardTablesRepository.find({ where: { roomId: room.id } });
    const blocker = roomTables
      .filter((other) => other.id !== selfId)
      .find((other) => tablesOverlap(placement, other, gapCm));
    if (blocker) {
      throw new ConflictException(
        `Too close to table ${blocker.number}: keep at least ${gapCm} cm between tables`,
      );
    }
  }
}
