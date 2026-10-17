import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { TableEntity } from '@/entities/tables/model/table.entity';
import { UpdateTableDto } from '@/entities/tables/dto/update-table.dto';
import { CreateTableDto } from '@/entities/tables/dto/create-table.dto';
import { TableFindAllFilters } from '@/entities/tables/interfaces/table.interfaces';

@Injectable()
export class TablesRepository {
  constructor(
    @InjectRepository(TableEntity)
    private readonly tableRepository: Repository<TableEntity>,
  ) {}

  async findAll(query: TableFindAllFilters): Promise<[TableEntity[], number]> {
    const tableQuery = this.tableRepository
      .createQueryBuilder('table')
      .orderBy('table.name', 'ASC')
      .skip(query.skip)
      .take(query.limit);

    if (query.name) {
      tableQuery.andWhere('table.name ILIKE :name', { name: `%${query.name}%` });
    }
    if (query.status) {
      tableQuery.andWhere('table.status = :status', { status: query.status });
    }
    if (query.type) {
      tableQuery.andWhere('table.type = :type', { type: query.type });
    }
    if (query.color) {
      tableQuery.andWhere('table.color = :color', { color: query.color });
    }

    return tableQuery.getManyAndCount();
  }

  findById(id: string): Promise<TableEntity | null> {
    return this.tableRepository.findOne({ where: { id } });
  }

  create(data: CreateTableDto): TableEntity {
    return this.tableRepository.create(data);
  }

  merge(table: TableEntity, data: UpdateTableDto): TableEntity {
    return this.tableRepository.merge(table, data);
  }

  save(table: TableEntity): Promise<TableEntity> {
    return this.tableRepository.save(table);
  }

  delete(id: string): Promise<DeleteResult> {
    return this.tableRepository.delete({ id });
  }
}
