import { Injectable, NotFoundException } from '@nestjs/common';
import { TablesRepository } from '@/entities/tables/repository/tables.repository';
import { TableQueryDto } from '@/entities/tables/dto/table-query.dto';
import { UpdateTableDto } from '@/entities/tables/dto/update-table.dto';
import { CreateTableDto } from '@/entities/tables/dto/create-table.dto';
import { TableEntity } from '@/entities/tables/model/table.entity';
import { PaginatedResponse } from '@/entities/users/interfaces/user.interface';

@Injectable()
export class TablesService {
  constructor(private readonly tablesRepository: TablesRepository) {}

  async getAllTables(query: TableQueryDto): Promise<PaginatedResponse<TableEntity>> {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const [tables, total] = await this.tablesRepository.findAll({
      name: query.name,
      status: query.status,
      type: query.type,
      color: query.color,
      limit,
      skip,
    });
    const totalPages = Math.ceil(total / limit);

    return {
      items: tables,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  createTable(data: CreateTableDto): Promise<TableEntity> {
    const table = this.tablesRepository.create(data);
    return this.tablesRepository.save(table);
  }

  async updateTable(id: string, data: UpdateTableDto): Promise<TableEntity> {
    const table = await this.getTableOrThrow(id);
    const updatedTable = this.tablesRepository.merge(table, data);

    return this.tablesRepository.save(updatedTable);
  }

  async deleteTable(id: string): Promise<void> {
    await this.getTableOrThrow(id);
    await this.tablesRepository.delete(id);
  }

  private async getTableOrThrow(id: string): Promise<TableEntity> {
    const table = await this.tablesRepository.findById(id);

    if (!table) {
      throw new NotFoundException(`Table ${id} not found`);
    }

    return table;
  }
}
